import { describe, expect, it } from "vitest";
import { describeVoice, groupVoices } from "./ttsVoices";

// Tên giọng thật của gói giọng đọc (25 giọng, mặc định "Hải Đăng"); nhãn vùng và giới tính theo trang model gốc (spec
// 2026-11-04-giong-doc §7). Năm tên trang model không ghi thì vào nhóm "Khác".
describe("describeVoice", () => {
  it("describes_known_voices: mỗi vùng và giới tính trong bảng", () => {
    expect(describeVoice("Minh Đức")).toEqual({ region: "north", gender: "male" });
    expect(describeVoice("Ngọc Huyền")).toEqual({ region: "north", gender: "female" });
    expect(describeVoice("Đoan Trang")).toEqual({ region: "north", gender: "female" });
    expect(describeVoice("Ngọc Trân")).toEqual({ region: "central", gender: "female" });
    expect(describeVoice("Quang Sơn")).toEqual({ region: "central", gender: "male" });
    expect(describeVoice("Adam")).toEqual({ region: "south", gender: "male" });
    expect(describeVoice("Đức Trí")).toEqual({ region: "south", gender: "male" });
    expect(describeVoice("Thục Đoan")).toEqual({ region: "south", gender: "female" });
  });

  it("so tên sau khi chuẩn hóa Unicode NFC (tên tổ hợp dấu rời vẫn khớp)", () => {
    expect(describeVoice("Thục Đoan".normalize("NFD"))).toEqual({ region: "south", gender: "female" });
    expect(describeVoice("Mỹ Duyên".normalize("NFD"))).toEqual({ region: "south", gender: "female" });
  });

  it("unknown_voice_goes_to_other: tên không có trong bảng thì vùng Khác, chưa rõ giới tính", () => {
    for (const name of ["Adam bựa", "Hải Đăng", "Quốc Tuấn", "Thiền Tâm Đức", "Thiện Minh", "Giọng mới"]) {
      expect(describeVoice(name), name).toEqual({ region: "other", gender: "unknown" });
    }
  });
});

describe("groupVoices", () => {
  it("groups_in_region_order_and_skips_empty: Bắc, Trung, Nam, Khác; bỏ nhóm rỗng; giữ thứ tự đầu vào", () => {
    expect(groupVoices(["Thái Sơn", "Hải Đăng", "Mai Anh", "Adam", "Minh Đức"])).toEqual([
      { region: "north", names: ["Mai Anh", "Minh Đức"] },
      { region: "south", names: ["Thái Sơn", "Adam"] },
      { region: "other", names: ["Hải Đăng"] },
    ]);
    expect(groupVoices(["Quang Sơn", "Ngọc Trân"])).toEqual([{ region: "central", names: ["Quang Sơn", "Ngọc Trân"] }]);
    expect(groupVoices([])).toEqual([]);
  });

  it("giữ nguyên tên như đầu vào (không đổi dạng chuẩn hóa)", () => {
    const nfd = "Thục Đoan".normalize("NFD");
    expect(groupVoices([nfd])).toEqual([{ region: "south", names: [nfd] }]);
  });
});
