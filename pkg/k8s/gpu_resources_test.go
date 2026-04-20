package k8s

import (
	"context"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
	k8sfake "k8s.io/client-go/kubernetes/fake"
)

// expectedGPUPerContainer mirrors the per-container GPU count the helper
// should derive from the fake pod spec below. Each container requests exactly
// one accelerator of its vendor-specific resource type.
const expectedGPUPerContainer = 1

// TestContainerGPURequest_AllVendors verifies that containerGPURequest sums
// the supported accelerator resource names (NVIDIA, AMD, Intel GPU,
// Habana/Intel Gaudi v1/v2, intel.com/gaudi). Regression guard for #9090
// where Intel and Gaudi workloads silently read as GPURequested=0.
func TestContainerGPURequest_AllVendors(t *testing.T) {
	cases := []struct {
		name     string
		resource corev1.ResourceName
	}{
		{"nvidia", ResourceNvidiaGPU},
		{"amd", ResourceAMDGPU},
		{"intel-gpu-i915", ResourceIntelGPUi915},
		{"habana-gaudi", ResourceHabanaGaudi},
		{"habana-gaudi2", ResourceHabanaGaudi2},
		{"intel-gaudi", ResourceIntelGaudi},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			c := corev1.Container{
				Resources: corev1.ResourceRequirements{
					Requests: corev1.ResourceList{
						tc.resource: resource.MustParse("1"),
					},
				},
			}
			if got := containerGPURequest(c); got != expectedGPUPerContainer {
				t.Errorf("containerGPURequest(%s) = %d; want %d", tc.resource, got, expectedGPUPerContainer)
			}
		})
	}
}

// TestContainerGPURequest_LimitsFallback ensures the helper falls back to
// Resources.Limits when only limits (not requests) are set, matching the
// behavior of the previous inline code path.
func TestContainerGPURequest_LimitsFallback(t *testing.T) {
	c := corev1.Container{
		Resources: corev1.ResourceRequirements{
			Limits: corev1.ResourceList{
				ResourceHabanaGaudi2: resource.MustParse("2"),
			},
		},
	}
	const expectedFallbackCount = 2
	if got := containerGPURequest(c); got != expectedFallbackCount {
		t.Errorf("containerGPURequest (limits-only) = %d; want %d", got, expectedFallbackCount)
	}
}

// TestContainerGPURequest_NoGPU ensures a container without any recognized
// accelerator resource reports zero (nil ResourceList must be safe).
func TestContainerGPURequest_NoGPU(t *testing.T) {
	c := corev1.Container{}
	if got := containerGPURequest(c); got != 0 {
		t.Errorf("containerGPURequest (no resources) = %d; want 0", got)
	}
}

// TestGetPods_GPURequested_IntelAndGaudi exercises the GetPods path end-to-end
// to make sure containers requesting Intel GPU or Gaudi accelerators surface
// a non-zero GPURequested, which the dashboard pod/namespace views rely on
// (#9090).
func TestGetPods_GPURequested_IntelAndGaudi(t *testing.T) {
	const testNamespace = "default"
	const testCluster = "c1"
	const expectedIntelGPU = 1
	const expectedGaudiGPU = 4

	pods := []*corev1.Pod{
		{
			ObjectMeta: metav1.ObjectMeta{Name: "intel-pod", Namespace: testNamespace},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{
					Name: "intel-c",
					Resources: corev1.ResourceRequirements{
						Requests: corev1.ResourceList{
							ResourceIntelGPUi915: resource.MustParse("1"),
						},
					},
				}},
			},
		},
		{
			ObjectMeta: metav1.ObjectMeta{Name: "gaudi-pod", Namespace: testNamespace},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{
					Name: "gaudi-c",
					Resources: corev1.ResourceRequirements{
						Limits: corev1.ResourceList{
							ResourceHabanaGaudi: resource.MustParse("4"),
						},
					},
				}},
			},
		},
	}

	objs := make([]runtime.Object, 0, len(pods))
	for _, p := range pods {
		objs = append(objs, p)
	}

	m, _ := NewMultiClusterClient("")
	m.clients[testCluster] = k8sfake.NewSimpleClientset(objs...)

	got, err := m.GetPods(context.Background(), testCluster, testNamespace)
	if err != nil {
		t.Fatalf("GetPods failed: %v", err)
	}

	byName := make(map[string]PodInfo, len(got))
	for _, p := range got {
		byName[p.Name] = p
	}

	intelPod, ok := byName["intel-pod"]
	if !ok {
		t.Fatalf("intel-pod missing from GetPods result")
	}
	if len(intelPod.Containers) != 1 || intelPod.Containers[0].GPURequested != expectedIntelGPU {
		t.Errorf("intel-pod GPURequested = %+v; want %d", intelPod.Containers, expectedIntelGPU)
	}

	gaudiPod, ok := byName["gaudi-pod"]
	if !ok {
		t.Fatalf("gaudi-pod missing from GetPods result")
	}
	if len(gaudiPod.Containers) != 1 || gaudiPod.Containers[0].GPURequested != expectedGaudiGPU {
		t.Errorf("gaudi-pod GPURequested = %+v; want %d", gaudiPod.Containers, expectedGaudiGPU)
	}
}
