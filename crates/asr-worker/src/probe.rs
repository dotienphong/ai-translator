//! `asr-worker-vulkan --probe`: liệt kê GPU qua Vulkan để đề xuất gói model (spec §6.4, §6.7).

use anyhow::Result;
use ash::vk;
use serde::Serialize;

#[derive(Serialize, Debug)]
pub struct GpuInfo {
    pub name: String,
    /// `discrete`, `integrated`, `virtual`, `cpu` hoặc `other`.
    pub device_type: String,
    /// Heap `DEVICE_LOCAL` lớn nhất, tính bằng byte.
    pub device_local_bytes: u64,
    pub vendor_id: u32,
}

pub fn list_gpus() -> Result<Vec<GpuInfo>> {
    let entry = unsafe { ash::Entry::load()? };
    let app = vk::ApplicationInfo::default().api_version(vk::make_api_version(0, 1, 2, 0));
    let create_info = vk::InstanceCreateInfo::default().application_info(&app);
    let instance = unsafe { entry.create_instance(&create_info, None)? };
    let gpus = unsafe { instance.enumerate_physical_devices() }.map(|devices| {
        devices
            .into_iter()
            .map(|device| {
                let props = unsafe { instance.get_physical_device_properties(device) };
                let memory = unsafe { instance.get_physical_device_memory_properties(device) };
                let device_local_bytes = memory.memory_heaps[..memory.memory_heap_count as usize]
                    .iter()
                    .filter(|heap| heap.flags.contains(vk::MemoryHeapFlags::DEVICE_LOCAL))
                    .map(|heap| heap.size)
                    .max()
                    .unwrap_or(0);
                let device_type = match props.device_type {
                    vk::PhysicalDeviceType::DISCRETE_GPU => "discrete",
                    vk::PhysicalDeviceType::INTEGRATED_GPU => "integrated",
                    vk::PhysicalDeviceType::VIRTUAL_GPU => "virtual",
                    vk::PhysicalDeviceType::CPU => "cpu",
                    _ => "other",
                };
                GpuInfo {
                    name: props
                        .device_name_as_c_str()
                        .map(|s| s.to_string_lossy().into_owned())
                        .unwrap_or_default(),
                    device_type: device_type.to_string(),
                    device_local_bytes,
                    vendor_id: props.vendor_id,
                }
            })
            .collect::<Vec<_>>()
    });
    // Hủy instance cả khi liệt kê thiết bị lỗi.
    unsafe { instance.destroy_instance(None) };
    Ok(gpus?)
}
