// Danh sách giấy phép bên thứ ba (spec §10.1): file THIRD_PARTY_NOTICES.txt ở gốc repo do scripts/release/notices.mjs
// sinh lúc build bản phát hành, và Vite đóng gói nó thành một chunk riêng, chỉ tải khi mở màn hình Giới thiệu.
// Bản dev chưa sinh file thì không có chunk nào.

/** Kết quả của `import.meta.glob(…, { query: "?raw", import: "default" })`: đường dẫn → hàm tải văn bản. */
export type NoticeLoaders = Record<string, () => Promise<string>>;

/** Văn bản giấy phép, hoặc null khi bản build không có file (hay file rỗng, hay tải lỗi). */
export async function loadNotices(loaders: NoticeLoaders): Promise<string | null> {
  const load = Object.values(loaders)[0];
  if (!load) return null;
  try {
    const text = await load();
    return text.trim() === "" ? null : text;
  } catch {
    return null;
  }
}
