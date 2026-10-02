//! Đề xuất gói theo máy (spec §6.7, §8; Đ7, Đ13 của kế hoạch 00). Ngưỡng nằm trong manifest đã ký: đổi ngưỡng hay thêm
//! gói lai không cần phát hành lại app. App chỉ tự quyết hai điều không đổi được bằng manifest: CPU x64 không có AVX2
//! thì chưa hỗ trợ (bản build cần AVX2), và RAM dưới `min_ram_mib` của manifest thì chưa hỗ trợ.

use serde::Serialize;

use super::machine::Machine;
use super::manifest::{GpuKind, Recommend, Rule};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Unsupported {
    /// RAM dưới `min_ram_mib` của manifest (§8; lúc lập kế hoạch 6 144 MiB).
    LowRam,
    /// CPU x64 không có AVX2 (§8, §6.12).
    NoAvx2,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Verdict {
    /// Máy chưa được hỗ trợ trong MVP: app báo lý do và cấu hình tối thiểu, và không cho tải model (chủ dự án quyết
    /// 2026-10-02; `ModelService::download` trả `modelsUnsupported`).
    Unsupported {
        reason: Unsupported,
    },
    Recommend {
        pack: String,
    },
}

fn matches(rule: &Rule, machine: &Machine) -> bool {
    let os = rule.os.is_none_or(|os| os == machine.os);
    let ram = rule.min_ram_mib.is_none_or(|min| machine.ram_mib >= min);
    let gpu = match rule.gpu {
        None => true,
        Some(GpuKind::Discrete) => machine
            .gpus
            .iter()
            .any(|g| g.discrete && rule.min_vram_mib.is_none_or(|min| g.vram_mib >= min)),
    };
    os && ram && gpu
}

pub fn recommend(machine: &Machine, recommend: &Recommend) -> Verdict {
    if !machine.avx2 {
        return Verdict::Unsupported {
            reason: Unsupported::NoAvx2,
        };
    }
    if machine.ram_mib < recommend.min_ram_mib {
        return Verdict::Unsupported {
            reason: Unsupported::LowRam,
        };
    }
    let pack = recommend
        .rules
        .iter()
        .find(|rule| matches(rule, machine))
        .map_or(&recommend.fallback, |rule| &rule.pack);
    Verdict::Recommend { pack: pack.clone() }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::machine::Gpu;
    use crate::models::manifest::{Manifest, Os};

    fn rules() -> Recommend {
        let value = crate::models::manifest::tests::sample();
        Manifest::parse(&serde_json::to_vec(&value).unwrap()).unwrap().recommend
    }

    fn mac(ram_mib: u64) -> Machine {
        Machine {
            os: Os::Macos,
            ram_mib,
            avx2: true,
            gpus: Vec::new(),
            gpu_known: true,
        }
    }

    fn windows(ram_mib: u64, gpus: &[(bool, u64)]) -> Machine {
        Machine {
            os: Os::Windows,
            ram_mib,
            avx2: true,
            gpus: gpus
                .iter()
                .map(|&(discrete, vram_mib)| Gpu {
                    name: "gpu".into(),
                    discrete,
                    vram_mib,
                })
                .collect(),
            gpu_known: true,
        }
    }

    fn pack(v: Verdict) -> String {
        match v {
            Verdict::Recommend { pack } => pack,
            other => panic!("{other:?}"),
        }
    }

    /// §6.7: Apple Silicon RAM từ 16 GB thì gói Chuẩn, còn lại gói Nhẹ.
    #[test]
    fn macs_by_ram() {
        let r = rules();
        assert_eq!(pack(recommend(&mac(16_384), &r)), "standard");
        assert_eq!(pack(recommend(&mac(15_000), &r)), "standard", "ngưỡng của manifest mẫu");
        assert_eq!(pack(recommend(&mac(14_999), &r)), "lite");
        assert_eq!(pack(recommend(&mac(8_192), &r)), "lite");
    }

    /// §6.7, §11 "card rời 4 GB và 6 GB": card rời từ 6 GB và RAM 16 GB thì gói Chuẩn; card 4 GB, GPU tích hợp, hay
    /// thiếu RAM thì gói Nhẹ.
    #[test]
    fn windows_by_ram_and_discrete_vram() {
        let r = rules();
        assert_eq!(pack(recommend(&windows(16_000, &[(true, 6_128)]), &r)), "standard");
        assert_eq!(pack(recommend(&windows(16_000, &[(true, 5_600)]), &r)), "standard");
        assert_eq!(
            pack(recommend(&windows(16_000, &[(true, 4_096)]), &r)),
            "lite",
            "card 4 GB"
        );
        assert_eq!(
            pack(recommend(&windows(16_000, &[(false, 16_000)]), &r)),
            "lite",
            "GPU tích hợp chưa tính"
        );
        assert_eq!(
            pack(recommend(&windows(16_000, &[(false, 512), (true, 8_192)]), &r)),
            "standard",
            "máy có cả GPU tích hợp và card rời"
        );
        assert_eq!(
            pack(recommend(&windows(8_000, &[(true, 8_192)]), &r)),
            "lite",
            "thiếu RAM"
        );
        assert_eq!(pack(recommend(&windows(16_000, &[]), &r)), "lite", "chưa dò được GPU");
        assert_eq!(
            pack(recommend(&mac(32_768), &r)),
            "standard",
            "luật Windows không áp cho Mac"
        );
    }

    /// §8: chưa hỗ trợ khi RAM dưới mức tối thiểu hay CPU không có AVX2 (Đ13).
    #[test]
    fn unsupported_machines() {
        let r = rules();
        assert_eq!(
            recommend(&mac(4_096), &r),
            Verdict::Unsupported {
                reason: Unsupported::LowRam
            }
        );
        let mut old = windows(16_000, &[(true, 8_192)]);
        old.avx2 = false;
        assert_eq!(
            recommend(&old, &r),
            Verdict::Unsupported {
                reason: Unsupported::NoAvx2
            }
        );
        assert_eq!(
            serde_json::to_value(recommend(&old, &r)).unwrap(),
            serde_json::json!({ "kind": "unsupported", "reason": "noAvx2" })
        );
    }

    /// Đ7: gói lai thêm bằng manifest, không sửa app (Q15).
    #[test]
    fn a_hybrid_pack_can_be_added_by_the_manifest() {
        let mut r = rules();
        r.rules.insert(
            0,
            Rule {
                pack: "hybrid".into(),
                os: Some(Os::Macos),
                min_ram_mib: Some(15_000),
                gpu: None,
                min_vram_mib: None,
            },
        );
        assert_eq!(pack(recommend(&mac(16_384), &r)), "hybrid");
        assert_eq!(pack(recommend(&mac(8_192), &r)), "lite");
    }
}
