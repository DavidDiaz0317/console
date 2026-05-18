package k8s

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (m *MultiClusterClient) GetGPUNodes(ctx context.Context, contextName string) ([]GPUNode, error) {
	nodes, _, err := m.getGPUNodesWithPods(ctx, contextName)
	return nodes, err
}

// getGPUNodesWithPods is the shared implementation of GetGPUNodes that also
// returns the cluster-wide pod list it fetched for allocation accounting.
// Callers that need the same pod list for subsequent analysis (e.g. stuck-pod
// detection in GetGPUNodeHealth, #9339) can reuse it instead of issuing a
// second cluster-wide Pods("").List call.
//
// The returned pod list may be nil on a listing failure; in that case the
// node inventory is still returned with zero allocations and the listing
// error is logged (#9091). Callers that rely on the pod list must handle nil.
func (m *MultiClusterClient) getGPUNodesWithPods(ctx context.Context, contextName string) ([]GPUNode, *corev1.PodList, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, nil, err
	}

	nodes, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, nil, err
	}

	// Fetch all pods once upfront to calculate accelerator allocations per node
	// This is much faster than querying pods per-node for large clusters.
	// A failure here is non-fatal — we still return the node inventory with
	// zero allocations, but we log the error so operators can see RBAC /
	// connectivity problems rather than seeing silently wrong allocation
	// numbers in the UI (issue #9091).
	allPods, allPodsErr := client.CoreV1().Pods("").List(ctx, metav1.ListOptions{})
	if allPodsErr != nil {
		slog.Error("[GPUNodes] failed to list pods for allocation accounting",
			"cluster", contextName, "error", allPodsErr)
	}
	// Track allocations by node and accelerator type
	gpuAllocationByNode := make(map[string]int) // GPU allocations
	tpuAllocationByNode := make(map[string]int) // TPU allocations
	aiuAllocationByNode := make(map[string]int) // AIU (IBM AIU) allocations
	xpuAllocationByNode := make(map[string]int) // XPU allocations
	if allPods != nil {
		for _, pod := range allPods.Items {
			nodeName := pod.Spec.NodeName
			if nodeName == "" {
				continue
			}
			for _, container := range pod.Spec.Containers {
				// Sum GPU requests (NVIDIA, AMD, Intel GPU, Intel Gaudi/Habana)
				// via the shared GPUResourceNames list in gpu_resources.go so this
				// path and the pod-level tracker in client_resources.go cannot
				// drift. Intel Gaudi is classified as AcceleratorGPU, so it rolls
				// into gpuAllocationByNode alongside nvidia/amd/i915.
				gpuAllocationByNode[nodeName] += SumGPURequested(container.Resources.Requests)
				// Check TPU requests (Google Cloud)
				if tpuReq, ok := container.Resources.Requests["google.com/tpu"]; ok {
					tpuAllocationByNode[nodeName] += int(tpuReq.Value())
				}
				// Check XPU requests (Intel)
				if xpuReq, ok := container.Resources.Requests["intel.com/xpu"]; ok {
					xpuAllocationByNode[nodeName] += int(xpuReq.Value())
				}
				// Check IBM AIU requests
				if aiuReq, ok := container.Resources.Requests["ibm.com/aiu"]; ok {
					aiuAllocationByNode[nodeName] += int(aiuReq.Value())
				}
			}
		}
	}

	var gpuNodes []GPUNode
	for _, node := range nodes.Items {
		// Check for various accelerator types in allocatable resources
		// GPUs
		nvidiaGPUQty, hasNvidiaGPU := node.Status.Allocatable["nvidia.com/gpu"]
		amdGPUQty, hasAMDGPU := node.Status.Allocatable["amd.com/gpu"]
		intelGPUQty, hasIntelGPU := node.Status.Allocatable["gpu.intel.com/i915"]
		// TPUs (Google Cloud)
		tpuQty, hasTPU := node.Status.Allocatable["google.com/tpu"]
		// AIUs (Intel Gaudi / Habana)
		gaudiQty, hasGaudi := node.Status.Allocatable["habana.ai/gaudi"]
		gaudi2Qty, hasGaudi2 := node.Status.Allocatable["habana.ai/gaudi2"]
		intelGaudiQty, hasIntelGaudi := node.Status.Allocatable["intel.com/gaudi"]
		// XPUs (Intel)
		xpuQty, hasXPU := node.Status.Allocatable["intel.com/xpu"]
		// AIUs (IBM)
		ibmAIUQty, hasIBMAIU := node.Status.Allocatable["ibm.com/aiu"]

		hasAnyAccelerator := hasNvidiaGPU || hasAMDGPU || hasIntelGPU || hasTPU || hasGaudi || hasGaudi2 || hasIntelGaudi || hasXPU || hasIBMAIU
		if !hasAnyAccelerator {
			continue
		}

		var deviceCount int
		var manufacturer string
		var deviceType string
		var accelType AcceleratorType

		// Check GPUs first
		if hasNvidiaGPU && nvidiaGPUQty.Value() > 0 {
			deviceCount = int(nvidiaGPUQty.Value())
			manufacturer = "NVIDIA"
			accelType = AcceleratorGPU
			// Get GPU type from NVIDIA GPU Feature Discovery labels
			if label, ok := node.Labels["nvidia.com/gpu.product"]; ok {
				deviceType = label
			} else if label, ok := node.Labels["accelerator"]; ok {
				deviceType = label
			} else {
				deviceType = "NVIDIA GPU"
			}
		} else if hasAMDGPU && amdGPUQty.Value() > 0 {
			deviceCount = int(amdGPUQty.Value())
			manufacturer = "AMD"
			accelType = AcceleratorGPU
			if label, ok := node.Labels["amd.com/gpu.product"]; ok {
				deviceType = label
			} else {
				deviceType = "AMD GPU"
			}
		} else if hasIntelGPU && intelGPUQty.Value() > 0 {
			deviceCount = int(intelGPUQty.Value())
			manufacturer = "Intel"
			accelType = AcceleratorGPU
			deviceType = "Intel GPU"
		} else if hasTPU && tpuQty.Value() > 0 {
			// Google TPU
			deviceCount = int(tpuQty.Value())
			manufacturer = "Google"
			accelType = AcceleratorTPU
			// Get TPU type from labels if available
			if label, ok := node.Labels["cloud.google.com/gke-tpu-accelerator"]; ok {
				deviceType = label
			} else if label, ok := node.Labels["cloud.google.com/gke-tpu-topology"]; ok {
				deviceType = "TPU " + label
			} else {
				deviceType = "Google TPU"
			}
		} else if (hasGaudi && gaudiQty.Value() > 0) || (hasGaudi2 && gaudi2Qty.Value() > 0) || (hasIntelGaudi && intelGaudiQty.Value() > 0) {
			// Intel Gaudi accelerators (formerly Habana Labs) - these are GPUs
			manufacturer = "Intel"
			accelType = AcceleratorGPU // Gaudi is classified as GPU-class accelerator
			if hasGaudi2 && gaudi2Qty.Value() > 0 {
				deviceCount = int(gaudi2Qty.Value())
				deviceType = "Intel Gaudi2"
			} else if hasGaudi && gaudiQty.Value() > 0 {
				deviceCount = int(gaudiQty.Value())
				deviceType = "Intel Gaudi"
			} else if hasIntelGaudi && intelGaudiQty.Value() > 0 {
				deviceCount = int(intelGaudiQty.Value())
				// Check for Gaudi generation from labels
				if label, ok := node.Labels["intel.com/gaudi.product"]; ok {
					deviceType = label
				} else {
					deviceType = "Intel Gaudi"
				}
			}
		} else if hasXPU && xpuQty.Value() > 0 {
			// Intel XPU
			deviceCount = int(xpuQty.Value())
			manufacturer = "Intel"
			accelType = AcceleratorXPU
			if label, ok := node.Labels["intel.com/xpu.product"]; ok {
				deviceType = label
			} else {
				deviceType = "Intel XPU"
			}
		} else if hasIBMAIU && ibmAIUQty.Value() > 0 {
			// IBM AIU (Artificial Intelligence Unit)
			deviceCount = int(ibmAIUQty.Value())
			manufacturer = "IBM"
			accelType = AcceleratorAIU
			if label, ok := node.Labels["ibm.com/aiu.product"]; ok {
				deviceType = label
			} else {
				deviceType = "IBM AIU"
			}
		} else {
			continue
		}

		if deviceCount == 0 {
			continue
		}

		// Extract enhanced GPU info from NVIDIA GPU Feature Discovery (GFD) labels
		var gpuMemoryMB int
		var gpuFamily string
		var cudaDriverVersion string
		var cudaRuntimeVersion string
		var migCapable bool
		var migStrategy string

		// GPU memory (in MB)
		if memLabel, ok := node.Labels["nvidia.com/gpu.memory"]; ok {
			fmt.Sscanf(memLabel, "%d", &gpuMemoryMB)
		}

		// GPU architecture family
		if familyLabel, ok := node.Labels["nvidia.com/gpu.family"]; ok {
			gpuFamily = familyLabel
		}

		// CUDA driver version (major.minor.rev)
		driverMajor := node.Labels["nvidia.com/cuda.driver.major"]
		driverMinor := node.Labels["nvidia.com/cuda.driver.minor"]
		driverRev := node.Labels["nvidia.com/cuda.driver.rev"]
		if driverMajor != "" {
			cudaDriverVersion = driverMajor
			if driverMinor != "" {
				cudaDriverVersion += "." + driverMinor
			}
			if driverRev != "" {
				cudaDriverVersion += "." + driverRev
			}
		}

		// CUDA runtime version
		runtimeMajor := node.Labels["nvidia.com/cuda.runtime.major"]
		runtimeMinor := node.Labels["nvidia.com/cuda.runtime.minor"]
		if runtimeMajor != "" {
			cudaRuntimeVersion = runtimeMajor
			if runtimeMinor != "" {
				cudaRuntimeVersion += "." + runtimeMinor
			}
		}

		// MIG capability
		if migLabel, ok := node.Labels["nvidia.com/mig.capable"]; ok {
			migCapable = migLabel == "true"
		}

		// MIG strategy
		if strategyLabel, ok := node.Labels["nvidia.com/mig.strategy"]; ok {
			migStrategy = strategyLabel
		}

		// Get allocated accelerators from pre-computed map based on type
		var allocated int
		switch accelType {
		case AcceleratorGPU:
			allocated = gpuAllocationByNode[node.Name]
		case AcceleratorTPU:
			allocated = tpuAllocationByNode[node.Name]
		case AcceleratorAIU:
			allocated = aiuAllocationByNode[node.Name]
		case AcceleratorXPU:
			allocated = xpuAllocationByNode[node.Name]
		}

		// Collect scheduling-gating taints so the UI can offer taint-aware
		// filtering of "available" GPUs. Only NoSchedule and
		// NoExecute gate scheduling; PreferNoSchedule is advisory and is
		// intentionally dropped here.
		var nodeTaints []GPUTaint
		for _, t := range node.Spec.Taints {
			if t.Effect != corev1.TaintEffectNoSchedule && t.Effect != corev1.TaintEffectNoExecute {
				continue
			}
			nodeTaints = append(nodeTaints, GPUTaint{
				Key:    t.Key,
				Value:  t.Value,
				Effect: string(t.Effect),
			})
		}

		gpuNodes = append(gpuNodes, GPUNode{
			Name:               node.Name,
			Cluster:            contextName,
			GPUType:            deviceType,
			GPUCount:           deviceCount,
			GPUAllocated:       allocated,
			AcceleratorType:    accelType,
			Taints:             nodeTaints,
			GPUMemoryMB:        gpuMemoryMB,
			GPUFamily:          gpuFamily,
			CUDADriverVersion:  cudaDriverVersion,
			CUDARuntimeVersion: cudaRuntimeVersion,
			MIGCapable:         migCapable,
			MIGStrategy:        migStrategy,
			Manufacturer:       manufacturer,
		})
	}

	return gpuNodes, allPods, nil
}

// GPU operator namespace names to search for operator pods
var gpuOperatorNamespaces = []string{
	"nvidia-gpu-operator",
	"gpu-operator",
	"nvidia-device-plugin",
	"kube-system",
}

// GetGPUNodeHealth returns proactive health status for all GPU nodes in a cluster.
// It checks node readiness, scheduling, GPU operator pod health, stuck pods, and GPU reset events.
func (m *MultiClusterClient) GetGPUNodeHealth(ctx context.Context, contextName string) ([]GPUNodeHealthStatus, error) {
	client, err := m.GetClient(contextName)
	if err != nil {
		return nil, err
	}

	// 1. Get GPU nodes AND reuse the cluster-wide pod list the lookup already
	// fetched. Previously we issued a redundant second Pods("").List call below
	// for stuck-pod detection — on large clusters (hundreds of namespaces,
	// thousands of pods) that second list doubled API-server load and latency
	// of this endpoint. (#9339)
	gpuNodes, allPods, err := m.getGPUNodesWithPods(ctx, contextName)
	if err != nil {
		return nil, fmt.Errorf("listing GPU nodes: %w", err)
	}
	if len(gpuNodes) == 0 {
		return nil, nil
	}

	// 2. Get node objects for condition checks
	nodeList, err := client.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("listing nodes: %w", err)
	}
	nodeMap := make(map[string]corev1.Node, len(nodeList.Items))
	for _, n := range nodeList.Items {
		nodeMap[n.Name] = n
	}

	// 3. Find GPU operator pods across known namespaces
	var operatorPods []corev1.Pod
	for _, ns := range gpuOperatorNamespaces {
		pods, listErr := client.CoreV1().Pods(ns).List(ctx, metav1.ListOptions{})
		if listErr != nil {
			continue // namespace may not exist
		}
		operatorPods = append(operatorPods, pods.Items...)
	}

	// 4. Stuck-pod detection reuses allPods from step 1 (see #9339). A nil
	// allPods means getGPUNodesWithPods failed the inner pod list — we've
	// already logged it there, so just proceed with empty stuck-pod data.

	// 5. Get warning events from the last hour for GPU reset detection.
	// Non-fatal, but log so operators can see why GPU-reset signals are
	// missing instead of silently getting a clean health state (issue #9091).
	oneHourAgo := time.Now().Add(-1 * time.Hour)
	events, eventsErr := client.CoreV1().Events("").List(ctx, metav1.ListOptions{
		FieldSelector: "type=Warning",
	})
	if eventsErr != nil {
		slog.Error("[GPUNodeHealth] failed to list warning events for GPU reset detection",
			"cluster", contextName, "error", eventsErr)
	}

	// 6. Build health status for each GPU node
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	var results []GPUNodeHealthStatus

	for _, gpuNode := range gpuNodes {
		nodeObj, exists := nodeMap[gpuNode.Name]
		if !exists {
			continue
		}

		checks := []GPUNodeHealthCheck{}
		issues := []string{}

		// Check 1: Node Ready
		nodeReady := false
		for _, cond := range nodeObj.Status.Conditions {
			if cond.Type == corev1.NodeReady {
				nodeReady = cond.Status == corev1.ConditionTrue
				if !nodeReady {
					msg := "Node is NotReady"
					if cond.Message != "" {
						msg = cond.Message
					}
					checks = append(checks, GPUNodeHealthCheck{Name: "node_ready", Passed: false, Message: msg})
					issues = append(issues, "Node is NotReady")
				} else {
					checks = append(checks, GPUNodeHealthCheck{Name: "node_ready", Passed: true})
				}
				break
			}
		}

		// Check 2: Scheduling enabled
		if nodeObj.Spec.Unschedulable {
			checks = append(checks, GPUNodeHealthCheck{Name: "scheduling", Passed: false, Message: "Node is cordoned (SchedulingDisabled)"})
			issues = append(issues, "Node is cordoned")
		} else {
			checks = append(checks, GPUNodeHealthCheck{Name: "scheduling", Passed: true})
		}

		// Check 3: gpu-feature-discovery pod
		gfdCheck := checkOperatorPod(operatorPods, gpuNode.Name, "gpu-feature-discovery")
		checks = append(checks, gfdCheck)
		if !gfdCheck.Passed {
			issues = append(issues, "gpu-feature-discovery: "+gfdCheck.Message)
		}

		// Check 4: nvidia-device-plugin pod
		dpCheck := checkOperatorPod(operatorPods, gpuNode.Name, "nvidia-device-plugin")
		checks = append(checks, dpCheck)
		if !dpCheck.Passed {
			issues = append(issues, "nvidia-device-plugin: "+dpCheck.Message)
		}

		// Check 5: dcgm-exporter pod
		dcgmCheck := checkOperatorPod(operatorPods, gpuNode.Name, "dcgm-exporter")
		checks = append(checks, dcgmCheck)
		if !dcgmCheck.Passed {
			issues = append(issues, "dcgm-exporter: "+dcgmCheck.Message)
		}

		// Check 6: Stuck pods on this node
		stuckCount := 0
		if allPods != nil {
			for i := range allPods.Items {
				pod := &allPods.Items[i]
				if pod.Spec.NodeName != gpuNode.Name {
					continue
				}
				if isStuckPod(pod) {
					stuckCount++
				}
			}
		}
		if stuckCount > 0 {
			msg := fmt.Sprintf("%d pods stuck (ContainerStatusUnknown/Terminating)", stuckCount)
			checks = append(checks, GPUNodeHealthCheck{Name: "stuck_pods", Passed: false, Message: msg})
			issues = append(issues, msg)
		} else {
			checks = append(checks, GPUNodeHealthCheck{Name: "stuck_pods", Passed: true})
		}

		// Check 7: GPU reset events
		gpuResetCount := 0
		if events != nil {
			for i := range events.Items {
				ev := &events.Items[i]
				if ev.LastTimestamp.Time.Before(oneHourAgo) && ev.EventTime.Time.Before(oneHourAgo) {
					continue
				}
				if ev.InvolvedObject.Name != gpuNode.Name {
					continue
				}
				msg := strings.ToLower(ev.Message)
				if strings.Contains(msg, "gpu") && (strings.Contains(msg, "reset") || strings.Contains(msg, "xid") || strings.Contains(msg, "nvlink") || strings.Contains(msg, "ecc")) {
					gpuResetCount++
				}
			}
		}
		if gpuResetCount > 0 {
			msg := fmt.Sprintf("%d GPU warning events in last hour", gpuResetCount)
			checks = append(checks, GPUNodeHealthCheck{Name: "gpu_events", Passed: false, Message: msg})
			issues = append(issues, msg)
		} else {
			checks = append(checks, GPUNodeHealthCheck{Name: "gpu_events", Passed: true})
		}

		// Derive overall status
		status := deriveGPUNodeStatus(checks)

		results = append(results, GPUNodeHealthStatus{
			NodeName:  gpuNode.Name,
			Cluster:   contextName,
			Status:    status,
			GPUCount:  gpuNode.GPUCount,
			GPUType:   gpuNode.GPUType,
			Checks:    checks,
			Issues:    issues,
			StuckPods: stuckCount,
			CheckedAt: checkedAt,
		})
	}

	return results, nil
}

// checkOperatorPod checks if a specific GPU operator pod is running on a node.
// It searches by pod name prefix and node name match (for DaemonSet pods).
func checkOperatorPod(pods []corev1.Pod, nodeName, podPrefix string) GPUNodeHealthCheck {
	for i := range pods {
		pod := &pods[i]
		if !strings.Contains(pod.Name, podPrefix) {
			continue
		}
		// DaemonSet pods run on specific nodes
		if pod.Spec.NodeName != nodeName {
			continue
		}
		if pod.Status.Phase == corev1.PodRunning {
			// Check for CrashLoopBackOff in container statuses
			for _, cs := range pod.Status.ContainerStatuses {
				if cs.State.Waiting != nil && cs.State.Waiting.Reason == "CrashLoopBackOff" {
					msg := fmt.Sprintf("CrashLoopBackOff (%d restarts)", cs.RestartCount)
					return GPUNodeHealthCheck{Name: podPrefix, Passed: false, Message: msg}
				}
			}
			return GPUNodeHealthCheck{Name: podPrefix, Passed: true}
		}
		// Not running
		reason := string(pod.Status.Phase)
		for _, cs := range pod.Status.ContainerStatuses {
			if cs.State.Waiting != nil && cs.State.Waiting.Reason != "" {
				reason = cs.State.Waiting.Reason
				if cs.RestartCount > 0 {
					reason = fmt.Sprintf("%s (%d restarts)", reason, cs.RestartCount)
				}
				break
			}
		}
		return GPUNodeHealthCheck{Name: podPrefix, Passed: false, Message: reason}
	}
	// Pod not found on this node — could be normal if operator not installed
	return GPUNodeHealthCheck{Name: podPrefix, Passed: true, Message: "not found (operator may not be installed)"}
}

// isStuckPod returns true if a pod appears stuck (ContainerStatusUnknown, long-Terminating, etc.)
func isStuckPod(pod *corev1.Pod) bool {
	// Check for ContainerStatusUnknown
	for _, cs := range pod.Status.ContainerStatuses {
		if cs.State.Terminated != nil && cs.State.Terminated.Reason == "ContainerStatusUnknown" {
			return true
		}
	}
	// Check for pods stuck in Terminating (deletion timestamp set but still exists) > 5 min
	if pod.DeletionTimestamp != nil {
		if time.Since(pod.DeletionTimestamp.Time) > 5*time.Minute {
			return true
		}
	}
	// Check for Pending pods stuck > 10 min
	if pod.Status.Phase == corev1.PodPending && pod.CreationTimestamp.Time.Before(time.Now().Add(-10*time.Minute)) {
		return true
	}
	return false
}

// deriveGPUNodeStatus determines overall health from individual checks.
// Critical checks (node_ready, stuck_pods) failing → unhealthy.
// 1-2 non-critical failures → degraded. All pass → healthy.
func deriveGPUNodeStatus(checks []GPUNodeHealthCheck) string {
	criticalFail := false
	failCount := 0
	for _, c := range checks {
		if c.Passed {
			continue
		}
		failCount++
		if c.Name == "node_ready" || c.Name == "stuck_pods" || c.Name == "gpu_events" {
			criticalFail = true
		}
	}
	if criticalFail || failCount >= 3 {
		return "unhealthy"
	}
	if failCount > 0 {
		return "degraded"
	}
	return "healthy"
}

// ============================================================================
// GPU Health CronJob Management
// ============================================================================

// GetGPUHealthCronJobStatus checks if the GPU health CronJob is installed and returns its status.
// It also reads structured results from the ConfigMap and auto-reconciles outdated script versions.
