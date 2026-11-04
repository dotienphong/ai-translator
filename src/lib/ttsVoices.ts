// Nhãn vùng và giới tính của các giọng trong gói giọng đọc (spec 2026-11-04-giong-doc §7), theo trang model gốc. Bảng tĩnh: tên
// giọng mà bảng chưa biết (gói mới thêm giọng, hay trang model không ghi) vẫn hiện, ở nhóm "Khác" với giới tính chưa rõ.

export type VoiceRegion = "north" | "central" | "south" | "other";
export type VoiceGender = "male" | "female" | "unknown";

// Giọng mặc định của từng ngôn ngữ đọc (cùng giá trị với `TTS_DEFAULT_VOICE_VI/EN` ở phía Rust).
export const DEFAULT_VOICE = { vi: "Thục Đoan", en: "Đức Trí" } as const;

export const VOICE_REGIONS: readonly VoiceRegion[] = ["north", "central", "south", "other"];

type Known = { region: Exclude<VoiceRegion, "other">; gender: Exclude<VoiceGender, "unknown"> };

const TABLE: Record<Known["region"], Record<Known["gender"], readonly string[]>> = {
  north: {
    male: ["Minh Đức", "Phạm Tuyên", "Thanh Bình", "Xuân Vĩnh"],
    female: ["Mai Anh", "Ngọc Huyền", "Ngọc Linh", "Quỳnh Anh", "Trúc Ly", "Đoan Trang"],
  },
  central: { male: ["Quang Sơn"], female: ["Ngọc Trân"] },
  south: {
    male: ["Adam", "Minh Triết", "Thái Sơn", "Đức Trí"],
    female: ["Kim Thanh", "Mỹ Duyên", "Thùy Dung", "Thục Đoan"],
  },
};

// Khóa là tên đã chuẩn hóa NFC: file giọng và mã nguồn có thể viết dấu tổ hợp khác nhau.
const KNOWN = new Map<string, Known>();
for (const [region, genders] of Object.entries(TABLE) as [Known["region"], Record<Known["gender"], readonly string[]>][]) {
  for (const [gender, names] of Object.entries(genders) as [Known["gender"], readonly string[]][]) {
    for (const name of names) KNOWN.set(name.normalize("NFC"), { region, gender });
  }
}

export function describeVoice(name: string): { region: VoiceRegion; gender: VoiceGender } {
  return KNOWN.get(name.normalize("NFC")) ?? { region: "other", gender: "unknown" };
}

// Nhóm theo vùng, thứ tự Bắc, Trung, Nam, Khác; bỏ nhóm rỗng; trong nhóm giữ thứ tự (và cách viết) của đầu vào.
export function groupVoices(names: string[]): { region: VoiceRegion; names: string[] }[] {
  return VOICE_REGIONS.map((region) => ({ region, names: names.filter((n) => describeVoice(n).region === region) })).filter(
    (g) => g.names.length > 0,
  );
}
