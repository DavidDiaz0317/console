package k8s

import (
	"context"
	"fmt"
	"log/slog"
	"strings"

	authorizationv1 "k8s.io/api/authorization/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/kubernetes"
)

func (m *MultiClusterClient) UninstallGPUHealthCronJob(ctx context.Context, contextName, namespace string) error {
	client, err := m.GetClient(contextName)
	if err != nil {
		return err
	}

	if namespace == "" {
		namespace = gpuHealthDefaultNS
	}

	// Delete CronJob
	if delErr := client.BatchV1().CronJobs(namespace).Delete(ctx, gpuHealthCronJobName, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		return fmt.Errorf("deleting CronJob: %w", delErr)
	}

	// Delete results ConfigMap
	if delErr := client.CoreV1().ConfigMaps(namespace).Delete(ctx, gpuHealthConfigMapName, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		slog.Warn("[GPUHealthCronJob] could not delete results ConfigMap", "error", delErr)
	}

	// Delete associated Jobs
	if delErr := client.BatchV1().Jobs(namespace).DeleteCollection(ctx, metav1.DeleteOptions{}, metav1.ListOptions{
		LabelSelector: "app=" + gpuHealthCronJobName,
	}); delErr != nil {
		slog.Warn("[GPUHealthCronJob] could not clean up jobs", "error", delErr)
	}

	// Delete ClusterRoleBinding
	if delErr := client.RbacV1().ClusterRoleBindings().Delete(ctx, gpuHealthClusterRoleBinding, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		slog.Warn("[GPUHealthCronJob] could not delete ClusterRoleBinding", "error", delErr)
	}

	// Delete ClusterRole
	if delErr := client.RbacV1().ClusterRoles().Delete(ctx, gpuHealthClusterRole, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		slog.Warn("[GPUHealthCronJob] could not delete ClusterRole", "error", delErr)
	}

	// Delete ServiceAccount
	if delErr := client.CoreV1().ServiceAccounts(namespace).Delete(ctx, gpuHealthServiceAccount, metav1.DeleteOptions{}); delErr != nil && !errors.IsNotFound(delErr) {
		slog.Warn("[GPUHealthCronJob] could not delete ServiceAccount", "error", delErr)
	}

	slog.Info("[GPUHealthCronJob] uninstalled", "cluster", contextName, "namespace", namespace)
	return nil
}

// canManageCronJobs checks if the current user has permissions to create/delete CronJobs in the given namespace.
func (m *MultiClusterClient) canManageCronJobs(ctx context.Context, client kubernetes.Interface, namespace string) bool {
	review := &authorizationv1.SelfSubjectAccessReview{
		Spec: authorizationv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authorizationv1.ResourceAttributes{
				Namespace: namespace,
				Verb:      "create",
				Group:     "batch",
				Resource:  "cronjobs",
			},
		},
	}
	result, err := client.AuthorizationV1().SelfSubjectAccessReviews().Create(ctx, review, metav1.CreateOptions{})
	if err != nil {
		return false
	}
	return result.Status.Allowed
}

// GetNodes returns detailed information about all nodes in a cluster

func (m *MultiClusterClient) GetNVIDIAOperatorStatus(ctx context.Context, contextName string) (*NVIDIAOperatorStatus, error) {
	dynamicClient, err := m.GetDynamicClient(contextName)
	if err != nil {
		return nil, err
	}

	status := &NVIDIAOperatorStatus{
		Cluster: contextName,
	}

	// GPU Operator ClusterPolicy GVR
	clusterPolicyGVR := schema.GroupVersionResource{
		Group:    "nvidia.com",
		Version:  "v1",
		Resource: "clusterpolicies",
	}

	// Try to get ClusterPolicy (GPU Operator)
	clusterPolicies, err := dynamicClient.Resource(clusterPolicyGVR).List(ctx, metav1.ListOptions{})
	if err == nil && len(clusterPolicies.Items) > 0 {
		cp := clusterPolicies.Items[0]
		gpuInfo := &GPUOperatorInfo{
			Installed: true,
		}

		// Get metadata
		if labels := cp.GetLabels(); labels != nil {
			if version, ok := labels["app.kubernetes.io/version"]; ok {
				gpuInfo.Version = version
			}
		}
		gpuInfo.Namespace = cp.GetNamespace()
		if gpuInfo.Namespace == "" {
			gpuInfo.Namespace = "gpu-operator"
		}

		// Get status
		if statusObj, found, _ := unstructuredNestedMap(cp.Object, "status"); found {
			if state, ok := statusObj["state"].(string); ok {
				gpuInfo.State = state
				gpuInfo.Ready = strings.EqualFold(state, "ready")
			}
		}

		// Get driver version from spec
		if spec, found, _ := unstructuredNestedMap(cp.Object, "spec"); found {
			if driver, found, _ := unstructuredNestedMap(spec, "driver"); found {
				if version, ok := driver["version"].(string); ok {
					gpuInfo.DriverVersion = version
				}
			}
			if toolkit, found, _ := unstructuredNestedMap(spec, "toolkit"); found {
				if version, ok := toolkit["version"].(string); ok {
					// CUDA version often embedded in toolkit version
					gpuInfo.CUDAVersion = version
				}
			}
		}

		// Get component states from status.conditions
		if conditions, found, _ := unstructuredNestedSlice(cp.Object, "status", "conditions"); found {
			for _, cond := range conditions {
				if condMap, ok := cond.(map[string]interface{}); ok {
					component := OperatorComponent{}
					if t, ok := condMap["type"].(string); ok {
						component.Name = t
					}
					if status, ok := condMap["status"].(string); ok {
						if strings.EqualFold(status, "True") {
							component.Status = "ready"
						} else {
							component.Status = "pending"
						}
					}
					if reason, ok := condMap["reason"].(string); ok {
						component.Reason = reason
					}
					if component.Name != "" {
						gpuInfo.Components = append(gpuInfo.Components, component)
					}
				}
			}
		}

		status.GPUOperator = gpuInfo
	}

	// Network Operator NicClusterPolicy GVR
	nicClusterPolicyGVR := schema.GroupVersionResource{
		Group:    "mellanox.com",
		Version:  "v1alpha1",
		Resource: "nicclusterpolicies",
	}

	// Try to get NicClusterPolicy (Network Operator)
	nicPolicies, err := dynamicClient.Resource(nicClusterPolicyGVR).List(ctx, metav1.ListOptions{})
	if err == nil && len(nicPolicies.Items) > 0 {
		ncp := nicPolicies.Items[0]
		netInfo := &NetworkOperatorInfo{
			Installed: true,
		}

		// Get metadata
		if labels := ncp.GetLabels(); labels != nil {
			if version, ok := labels["app.kubernetes.io/version"]; ok {
				netInfo.Version = version
			}
		}
		netInfo.Namespace = ncp.GetNamespace()
		if netInfo.Namespace == "" {
			netInfo.Namespace = "nvidia-network-operator"
		}

		// Get status
		if statusObj, found, _ := unstructuredNestedMap(ncp.Object, "status"); found {
			if state, ok := statusObj["state"].(string); ok {
				netInfo.State = state
				netInfo.Ready = strings.EqualFold(state, "ready")
			}
		}

		// Get component states
		if conditions, found, _ := unstructuredNestedSlice(ncp.Object, "status", "conditions"); found {
			for _, cond := range conditions {
				if condMap, ok := cond.(map[string]interface{}); ok {
					component := OperatorComponent{}
					if t, ok := condMap["type"].(string); ok {
						component.Name = t
					}
					if status, ok := condMap["status"].(string); ok {
						if strings.EqualFold(status, "True") {
							component.Status = "ready"
						} else {
							component.Status = "pending"
						}
					}
					if reason, ok := condMap["reason"].(string); ok {
						component.Reason = reason
					}
					if component.Name != "" {
						netInfo.Components = append(netInfo.Components, component)
					}
				}
			}
		}

		status.NetworkOperator = netInfo
	}

	return status, nil
}

// Helper function to get nested map from unstructured object
func unstructuredNestedMap(obj map[string]interface{}, fields ...string) (map[string]interface{}, bool, error) {
	var val interface{} = obj
	for _, field := range fields {
		if m, ok := val.(map[string]interface{}); ok {
			var found bool
			val, found = m[field]
			if !found {
				return nil, false, nil
			}
		} else {
			return nil, false, nil
		}
	}
	if result, ok := val.(map[string]interface{}); ok {
		return result, true, nil
	}
	return nil, false, nil
}

// Helper function to get nested slice from unstructured object
func unstructuredNestedSlice(obj map[string]interface{}, fields ...string) ([]interface{}, bool, error) {
	var val interface{} = obj
	for _, field := range fields {
		if m, ok := val.(map[string]interface{}); ok {
			var found bool
			val, found = m[field]
			if !found {
				return nil, false, nil
			}
		} else {
			return nil, false, nil
		}
	}
	if result, ok := val.([]interface{}); ok {
		return result, true, nil
	}
	return nil, false, nil
}
