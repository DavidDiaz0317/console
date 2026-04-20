package k8s

import (
	corev1 "k8s.io/api/core/v1"
)

// GPU / accelerator resource names that appear in Pod container
// Resources.Requests and Resources.Limits. These must stay in sync with the
// accelerator types recognized by GetGPUNodes (see client_gpu.go); without
// that, the node inventory reports Intel/Gaudi silicon but pod-level
// GPURequested reads zero on the same workloads (#9090).
const (
	// ResourceNvidiaGPU is the NVIDIA device-plugin resource name.
	ResourceNvidiaGPU corev1.ResourceName = "nvidia.com/gpu"
	// ResourceAMDGPU is the AMD (ROCm) device-plugin resource name.
	ResourceAMDGPU corev1.ResourceName = "amd.com/gpu"
	// ResourceIntelGPUi915 is the Intel discrete/integrated GPU (i915) resource
	// name exposed by the Intel device plugin.
	ResourceIntelGPUi915 corev1.ResourceName = "gpu.intel.com/i915"
	// ResourceHabanaGaudi is the Habana/Intel Gaudi v1 resource name.
	ResourceHabanaGaudi corev1.ResourceName = "habana.ai/gaudi"
	// ResourceHabanaGaudi2 is the Habana/Intel Gaudi v2 resource name.
	ResourceHabanaGaudi2 corev1.ResourceName = "habana.ai/gaudi2"
	// ResourceIntelGaudi is the newer Intel-branded Gaudi resource name shipped
	// after the Intel acquisition of Habana Labs.
	ResourceIntelGaudi corev1.ResourceName = "intel.com/gaudi"
)

// gpuResourceNames is the canonical set of container-level accelerator
// resource names treated as "GPU requests" for pod/container reporting.
// Callers that need to add a new vendor should extend this slice rather than
// sprinkling additional string comparisons throughout the package.
var gpuResourceNames = []corev1.ResourceName{
	ResourceNvidiaGPU,
	ResourceAMDGPU,
	ResourceIntelGPUi915,
	ResourceHabanaGaudi,
	ResourceHabanaGaudi2,
	ResourceIntelGaudi,
}

// containerGPURequest returns the GPU/accelerator count requested by a single
// container. It prefers Resources.Requests and falls back to Resources.Limits
// (Kubernetes defaults requests to limits when only limits are set). Returns 0
// if no recognized accelerator resource is present.
func containerGPURequest(c corev1.Container) int {
	if qty := sumGPUFromResourceList(c.Resources.Requests); qty > 0 {
		return qty
	}
	return sumGPUFromResourceList(c.Resources.Limits)
}

// sumGPUFromResourceList sums the recognized GPU/accelerator resource values
// from a Kubernetes ResourceList. Returns 0 for a nil or empty list.
func sumGPUFromResourceList(list corev1.ResourceList) int {
	if list == nil {
		return 0
	}
	total := 0
	for _, name := range gpuResourceNames {
		if qty, ok := list[name]; ok {
			total += int(qty.Value())
		}
	}
	return total
}
