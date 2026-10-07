//! Luật hạn mức (spec §6.8 "Hạn mức", §4.2 bước 2, §10.2; `quota-decisions-2.md`, `notes-for-plan06.md`), viết thành
//! phép tính thuần, không đụng kho khóa hay đồng hồ: nơi gọi truyền giờ và bản ghi vào, lưu kết quả ra. Phút tính bằng
//! mili giây tiếng nói đã dịch (`EventSink::usage`).
//!
//! **Gói trả phí.** Chu kỳ 30 ngày tính từ `cycle_anchor`; số thứ tự `n` theo `issued_at` của token mới nhất (giờ server),
//! kẹp `n ≥ 0`, nên chỉnh đồng hồ máy không mở được chu kỳ mới. Khóa của bộ đếm là (`license_id`, `activation_id`, mốc đầu
//! chu kỳ, `quota_epoch`). Bản ghi đánh dấu của activation giữ mốc và epoch của bộ đếm gần nhất. [`resolve_paid`] chọn bộ
//! đếm theo thứ tự:
//! 1. đã có bộ đếm của khóa hiện tại: dùng nó (rồi cập nhật bản ghi đánh dấu nếu đang cũ);
//! 2. token vừa nhận từ server có `quota_fresh`: bắt đầu từ 0;
//! 3. epoch của token lớn hơn epoch trong bản ghi đánh dấu: bắt đầu từ 0 (chỉ admin tăng được epoch);
//! 4. bản ghi đánh dấu có mốc cũ hơn mốc hiện tại (sang chu kỳ mới): bắt đầu từ 0;
//! 5. còn lại là mất bản ghi: coi như đã dùng hết hạn mức của chu kỳ.
//!
//! **Free.** Một bộ đếm theo ngày, 30 phút (spec 2026-10-07 §1), chỉ trong 10 ngày dùng thử (luật dùng thử ở `manager`). Reset khi ngày theo giờ máy đã tăng **và** đã qua ít nhất 20 giờ theo "đồng
//! hồ thật" (lớn nhất trong: thời gian đơn điệu cộng dồn lúc app chạy; hiệu hai header `Date` của server; hiệu giờ máy,
//! chỉ khi giờ máy không nhỏ hơn mốc lớn nhất từng thấy quá 10 phút). Bộ đếm Free luôn cộng cả phút dịch lúc ở gói trả
//! phí, và hết hạn mức gói trả phí thì Free của ngày đó cũng hết.

use chrono::{Days, NaiveDate, TimeZone};
use serde::{Deserialize, Serialize};

use super::token::Claims;

pub const DAY_SECS: i64 = 86_400;
pub const CYCLE_SECS: i64 = 30 * DAY_SECS;
/// Hạn mức Free mỗi ngày (spec 2026-10-07 §1): hằng số phía app, vì token dùng thử không mang hạn mức.
pub const FREE_DAILY_MS: u64 = 30 * 60_000;
/// Free reset cần đã qua ít nhất chừng này theo "đồng hồ thật" kể từ lần reset trước.
pub const FREE_MIN_GAP_SECS: i64 = 20 * 3600;
/// Giờ máy nhỏ hơn mốc lớn nhất từng thấy quá chừng này thì coi là đã chỉnh lùi (§10.2).
pub const ROLLBACK_TOLERANCE_SECS: i64 = 10 * 60;
/// Nhắc khi hạn mức còn chừng này (§4.2 bước 2).
pub const WARN_REMAINING_MS: u64 = 5 * 60_000;

/// Chu kỳ hạn mức hiện tại của một token.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Cycle {
    /// Số thứ tự `n` (≥ 0).
    pub n: i64,
    /// Mốc đầu chu kỳ: `cycle_anchor + n × 30 ngày`.
    pub start: i64,
    /// Mốc đầu chu kỳ kế tiếp.
    pub next_start: i64,
    /// Hạn mức của chu kỳ (mili giây); `None` là không giới hạn. Chu kỳ cuối ngắn hơn 30 ngày tính theo số ngày còn lại.
    pub limit_ms: Option<u64>,
}

/// Chu kỳ theo `issued_at` của token (giờ server), kẹp `n ≥ 0` (mục 3 của bổ sung sau review cuối 05).
pub fn cycle(claims: &Claims) -> Cycle {
    let n = (claims.issued_at - claims.cycle_anchor).div_euclid(CYCLE_SECS).max(0);
    let start = claims.cycle_anchor + n * CYCLE_SECS;
    let next_start = start + CYCLE_SECS;
    let limit_ms = claims.quota_minutes_per_cycle.map(|minutes| {
        let minutes = u64::from(minutes);
        let minutes = if claims.expires_at < next_start {
            // Chu kỳ cuối ngắn: ceil(hạn_mức × số_ngày / 30), số_ngày làm tròn lên.
            let days = (claims.expires_at - start).max(0).div_euclid(DAY_SECS)
                + i64::from((claims.expires_at - start).max(0).rem_euclid(DAY_SECS) > 0);
            (minutes * days as u64).div_ceil(30)
        } else {
            minutes
        };
        minutes * 60_000
    });
    Cycle {
        n,
        start,
        next_start,
        limit_ms,
    }
}

/// Khóa của bộ đếm gói trả phí.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaidKey {
    pub license_id: String,
    pub activation_id: String,
    pub cycle_start: i64,
    pub epoch: i64,
}

impl PaidKey {
    pub fn of(claims: &Claims) -> Self {
        Self {
            license_id: claims.license_id.clone(),
            activation_id: claims.activation_id.clone(),
            cycle_start: cycle(claims).start,
            epoch: claims.quota_epoch,
        }
    }
}

/// Bộ đếm của một khóa. `lost`: tạo ra vì mất bản ghi (đã dùng hết), để giao diện báo lý do và cách liên hệ hỗ trợ.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct PaidCounter {
    pub key: PaidKey,
    pub used_ms: u64,
    #[serde(default)]
    pub lost: bool,
}

/// Bản ghi đánh dấu "đã từng chạy license này trên máy này" của một activation.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Marker {
    pub license_id: String,
    pub activation_id: String,
    pub cycle_start: i64,
    pub epoch: i64,
}

impl Marker {
    pub fn of(key: &PaidKey) -> Self {
        Self {
            license_id: key.license_id.clone(),
            activation_id: key.activation_id.clone(),
            cycle_start: key.cycle_start,
            epoch: key.epoch,
        }
    }
}

/// Bộ đếm chọn được cho token hiện tại.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Resolution {
    /// Dùng bộ đếm đã có (luật 1).
    Existing,
    /// Bắt đầu từ 0 (luật 2–4).
    Fresh,
    /// Mất bản ghi: đã dùng hết hạn mức của chu kỳ (luật 5).
    Lost,
}

/// Kết quả: bộ đếm để dùng, cùng việc cần ghi xuống kho khóa, theo đúng thứ tự (bộ đếm trước, bản ghi đánh dấu sau).
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PaidState {
    pub resolution: Resolution,
    pub counter: PaidCounter,
    /// Ghi bộ đếm (bộ đếm mới hay bộ đếm "mất bản ghi").
    pub write_counter: bool,
    /// Ghi bản ghi đánh dấu (chưa có, hay đang cũ).
    pub write_marker: bool,
}

/// Chọn bộ đếm cho token (xem đầu module). `fresh`: token **vừa nhận từ server** có `quota_fresh` (token đọc lại từ kho
/// khóa luôn là `false`). `existing`: bộ đếm của khóa hiện tại nếu có. `marker`: bản ghi đánh dấu của activation này.
pub fn resolve_paid(claims: &Claims, fresh: bool, existing: Option<PaidCounter>, marker: Option<&Marker>) -> PaidState {
    let key = PaidKey::of(claims);
    let stale_marker = |m: Option<&Marker>| m.is_none_or(|m| *m != Marker::of(&key));
    if let Some(counter) = existing.filter(|c| c.key == key) {
        return PaidState {
            resolution: Resolution::Existing,
            write_marker: stale_marker(marker),
            counter,
            write_counter: false,
        };
    }
    let marker = marker.filter(|m| m.license_id == key.license_id && m.activation_id == key.activation_id);
    let fresh_start = fresh
        || marker.is_some_and(|m| key.epoch > m.epoch)
        || marker.is_some_and(|m| m.epoch == key.epoch && m.cycle_start < key.cycle_start);
    let (resolution, used_ms, lost) = if fresh_start {
        (Resolution::Fresh, 0, false)
    } else {
        let limit = cycle(claims).limit_ms.unwrap_or(0);
        (Resolution::Lost, limit, true)
    };
    PaidState {
        resolution,
        counter: PaidCounter {
            key: key.clone(),
            used_ms,
            lost,
        },
        write_counter: true,
        write_marker: true,
    }
}

/// Còn bao nhiêu mili giây của chu kỳ; `None` là không giới hạn.
pub fn paid_remaining(claims: &Claims, counter: &PaidCounter) -> Option<u64> {
    cycle(claims)
        .limit_ms
        .map(|limit| limit.saturating_sub(counter.used_ms))
}

/// Bộ đếm Free của ngày.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct FreeCounter {
    /// Ngày (theo giờ máy) của lần reset gần nhất.
    pub day: NaiveDate,
    /// Giờ máy lúc reset (giây Unix).
    pub reset_at: i64,
    /// Header `Date` mới nhất của server thấy được trước lần reset (giây Unix), nếu có.
    pub server_date_at_reset: Option<i64>,
    /// Thời gian đơn điệu cộng dồn lúc app chạy kể từ lần reset (mili giây).
    pub monotonic_ms: u64,
    pub used_ms: u64,
    /// Tạo ra vì mất bản ghi (đã dùng hết hôm đó).
    #[serde(default)]
    pub lost: bool,
    /// Bộ đếm vừa được kéo về vì lần reset ghi theo giờ máy ở tương lai: giờ máy không tin được tới lần reset sau, nên lần
    /// reset đó chỉ dựa vào thời gian đơn điệu hay hiệu header `Date` (QB của review 06 lần 2).
    #[serde(default)]
    pub clock_pulled: bool,
}

/// Mốc thời gian chung cho luật đồng hồ.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct Seen {
    /// Giờ máy lớn nhất từng thấy (giây Unix).
    pub max_machine: i64,
    /// Header `Date` mới nhất của server (giây Unix).
    pub latest_server_date: Option<i64>,
}

impl Seen {
    /// Ghi nhận giờ máy hiện tại.
    pub fn observe_machine(&mut self, now: i64) {
        self.max_machine = self.max_machine.max(now);
    }

    /// Ghi nhận `issued_at` của token đã ký: một mốc giờ của server không làm giả được, có cả khi offline hay khi response
    /// không có `Date` (QA của review 06 lần 2). Nâng mốc của giờ tin được và của chỉnh lùi; không hạ giờ máy lớn nhất (token
    /// có thể đã cấp từ nhiều ngày trước).
    pub fn observe_signed(&mut self, issued_at: i64) {
        self.latest_server_date = Some(self.latest_server_date.map_or(issued_at, |d| d.max(issued_at)));
    }

    /// Ghi nhận header `Date` của một response từ server của app. Mốc giờ máy lớn nhất mà vượt giờ server quá 10 phút (giờ
    /// máy từng bị đặt tới trước rồi chỉnh lại đúng) thì hạ về giờ server: server là nguồn giờ đáng tin (qua TLS), nên
    /// người từng đặt nhầm giờ tới trước không bị coi là chỉnh lùi mãi. Chỉnh lùi thật vẫn bị phát hiện, vì giờ máy khi
    /// đó nhỏ hơn cả giờ server.
    pub fn observe_server(&mut self, date: i64) {
        self.latest_server_date = Some(self.latest_server_date.map_or(date, |d| d.max(date)));
        if self.max_machine > date + ROLLBACK_TOLERANCE_SECS {
            self.max_machine = date;
        }
    }

    /// Giờ tin được: giờ máy, hay header `Date` mới nhất của server nếu lớn hơn (giờ máy chậm). Dùng để so thời hạn của
    /// token, để đặt giờ máy lùi không kéo dài được gói trả phí.
    pub fn trusted_now(&self, now: i64) -> i64 {
        self.latest_server_date.map_or(now, |d| now.max(d))
    }

    /// Đồng hồ đã bị chỉnh lùi (§10.2): giờ máy hiện tại nhỏ hơn quá 10 phút so với mốc lớn nhất từng thấy, hay so với
    /// header `Date` mới nhất của server (giờ máy chậm từ trước lần mở app đầu tiên).
    pub fn rolled_back(&self, now: i64) -> bool {
        let mark = self
            .latest_server_date
            .map_or(self.max_machine, |d| self.max_machine.max(d));
        now < mark - ROLLBACK_TOLERANCE_SECS
    }
}

/// Ngày theo múi giờ `tz` của thời điểm `t`. App truyền `chrono::Local` (giờ máy); test truyền múi giờ cố định.
pub fn local_day<Tz: TimeZone>(tz: &Tz, t: i64) -> NaiveDate {
    tz.timestamp_opt(t, 0)
        .earliest()
        .map_or_else(NaiveDate::default, |d| d.date_naive())
}

/// Bộ đếm Free mới, bắt đầu từ 0, reset lúc `now`.
pub fn free_start<Tz: TimeZone>(tz: &Tz, now: i64, seen: &Seen) -> FreeCounter {
    FreeCounter {
        day: local_day(tz, now),
        reset_at: now,
        server_date_at_reset: seen.latest_server_date,
        monotonic_ms: 0,
        used_ms: 0,
        lost: false,
        clock_pulled: false,
    }
}

/// Thời gian đã qua kể từ lần reset theo "đồng hồ thật" (giây): lớn nhất trong ba số (xem đầu module).
pub fn free_elapsed(counter: &FreeCounter, now: i64, seen: &Seen) -> i64 {
    let monotonic = (counter.monotonic_ms / 1000) as i64;
    let server = match (counter.server_date_at_reset, seen.latest_server_date) {
        (Some(before), Some(latest)) => latest - before,
        _ => 0,
    };
    let machine = if seen.rolled_back(now) || counter.clock_pulled {
        0
    } else {
        now - counter.reset_at
    };
    monotonic.max(server).max(machine)
}

/// Bộ đếm Free dùng lúc `now`. `stored`: bộ đếm đã lưu nếu có. `has_prior_data`: app đã có dữ liệu từ trước (file cài
/// đặt, mục kho khóa khác). Trả bộ đếm và `true` nếu phải ghi lại.
pub fn resolve_free<Tz: TimeZone>(
    tz: &Tz,
    stored: Option<FreeCounter>,
    has_prior_data: bool,
    now: i64,
    seen: &Seen,
) -> (FreeCounter, bool) {
    match stored {
        // Lần reset ghi theo giờ máy ở tương lai (giờ máy từng đặt nhầm tới trước rồi chỉnh lại): kéo `day`, `reset_at` về
        // hiện tại, giữ phút đã dùng và thời gian đơn điệu đã đếm, và đánh dấu giờ máy không tin được tới lần reset sau:
        // lần đó cần sang ngày mới và 20 giờ thời gian đơn điệu hay hiệu `Date` tính từ đây, không tính hiệu giờ máy (QB của
        // review 06 lần 2). Mốc `Date` là `Date` đầu tiên nhận sau khi kéo về, không phải một `Date` cũ (N1 của review 06 lần
        // 3). Nhờ vậy đặt giờ tới trước rồi lùi về, lặp lại, không mở thêm phút nào.
        Some(c) if c.reset_at > now + ROLLBACK_TOLERANCE_SECS => (
            FreeCounter {
                day: local_day(tz, now),
                reset_at: now,
                server_date_at_reset: None,
                clock_pulled: true,
                ..c
            },
            true,
        ),
        // Ngày theo giờ máy lùi mà giờ Unix không lùi (đổi múi giờ về phía tây): chỉ kéo `day` về, giờ máy vẫn tin được (N2
        // của review 06 lần 3).
        Some(c) if c.day > local_day(tz, now) => (
            FreeCounter {
                day: local_day(tz, now),
                ..c
            },
            true,
        ),
        Some(c) if local_day(tz, now) > c.day && free_elapsed(&c, now, seen) >= FREE_MIN_GAP_SECS => {
            (free_start(tz, now, seen), true)
        }
        Some(c) => (c, false),
        None if has_prior_data => (
            FreeCounter {
                used_ms: FREE_DAILY_MS,
                lost: true,
                ..free_start(tz, now, seen)
            },
            true,
        ),
        None => (free_start(tz, now, seen), true),
    }
}

/// Thời điểm hạn mức Free reset (giây Unix, giờ máy): max(00:00 hôm sau của ngày reset, lần reset trước + 20 giờ).
pub fn free_reset_time<Tz: TimeZone>(tz: &Tz, counter: &FreeCounter) -> i64 {
    let midnight = counter
        .day
        .checked_add_days(Days::new(1))
        .and_then(|d| d.and_hms_opt(0, 0, 0))
        .and_then(|d| tz.from_local_datetime(&d).earliest())
        .map_or(counter.reset_at + DAY_SECS, |d| d.timestamp());
    midnight.max(counter.reset_at + FREE_MIN_GAP_SECS)
}

pub fn free_remaining(counter: &FreeCounter) -> u64 {
    FREE_DAILY_MS.saturating_sub(counter.used_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::license::token::Plan;
    use chrono::FixedOffset;

    /// 2026-10-01 00:00:00 UTC.
    const T0: i64 = 1_790_812_800;
    const MIN: u64 = 60_000;

    fn claims() -> Claims {
        Claims {
            kid: "test-1".into(),
            license_id: "lic".into(),
            activation_id: "act".into(),
            activation_created_at: T0,
            device_id_hash: "dev".into(),
            plan: Plan::Monthly,
            expires_at: T0 + 60 * DAY_SECS,
            cycle_anchor: T0,
            quota_minutes_per_cycle: Some(1800),
            quota_epoch: 0,
            quota_fresh: false,
            issued_at: T0 + DAY_SECS,
            refresh_before: T0 + 15 * DAY_SECS,
        }
    }

    fn counter(c: &Claims, used_ms: u64) -> PaidCounter {
        PaidCounter {
            key: PaidKey::of(c),
            used_ms,
            lost: false,
        }
    }

    fn marker(c: &Claims) -> Marker {
        Marker::of(&PaidKey::of(c))
    }

    #[test]
    fn the_cycle_follows_the_server_clock_and_never_goes_below_zero() {
        let mut c = claims();
        assert_eq!(cycle(&c).n, 0);
        c.issued_at = T0 + CYCLE_SECS - 1;
        assert_eq!(cycle(&c).n, 0);
        c.issued_at = T0 + CYCLE_SECS;
        assert_eq!((cycle(&c).n, cycle(&c).start), (1, T0 + CYCLE_SECS));
        // Token cấp trước `cycle_anchor` (đồng hồ của cổng thanh toán nhanh hơn server): kẹp về chu kỳ 0, không phải -1.
        c.issued_at = T0 - 10;
        assert_eq!((cycle(&c).n, cycle(&c).start), (0, T0));
    }

    #[test]
    fn a_short_last_cycle_gets_a_share_of_the_quota_rounded_up() {
        let mut c = claims();
        assert_eq!(cycle(&c).limit_ms, Some(1800 * MIN));
        // Chu kỳ thứ hai chỉ còn 6 ngày 1 giây: 7 ngày, ceil(1800 × 7 / 30) = 420 phút.
        c.issued_at = T0 + CYCLE_SECS;
        c.expires_at = T0 + CYCLE_SECS + 6 * DAY_SECS + 1;
        assert_eq!(cycle(&c).limit_ms, Some(420 * MIN));
        c.expires_at = T0 + CYCLE_SECS + DAY_SECS / 2;
        assert_eq!(cycle(&c).limit_ms, Some(60 * MIN), "nửa ngày làm tròn lên 1 ngày");
        // Hạn mức không chia hết cho 30 (bảng gói ở server đổi được): làm tròn lên.
        c.quota_minutes_per_cycle = Some(1000);
        c.expires_at = T0 + CYCLE_SECS + 6 * DAY_SECS + 1;
        assert_eq!(cycle(&c).limit_ms, Some(234 * MIN), "ceil(1000 × 7 / 30) = 234");
        c.quota_minutes_per_cycle = None;
        assert_eq!(cycle(&c).limit_ms, None, "Yearly không giới hạn");
    }

    #[test]
    fn an_existing_counter_is_used_and_a_stale_or_missing_marker_is_rewritten() {
        let c = claims();
        let s = resolve_paid(&c, true, Some(counter(&c, 5 * MIN)), Some(&marker(&c)));
        assert_eq!(
            (s.resolution, s.counter.used_ms, s.write_counter, s.write_marker),
            (Resolution::Existing, 5 * MIN, false, false)
        );
        // Mất bản ghi đánh dấu nhưng còn bộ đếm (notes-for-plan06 mục 1): dùng bộ đếm, ghi lại bản ghi đánh dấu.
        let s = resolve_paid(&c, false, Some(counter(&c, 5 * MIN)), None);
        assert_eq!((s.resolution, s.write_marker), (Resolution::Existing, true));
        let mut old = marker(&c);
        old.cycle_start -= CYCLE_SECS;
        let s = resolve_paid(&c, false, Some(counter(&c, 5 * MIN)), Some(&old));
        assert_eq!((s.resolution, s.write_marker), (Resolution::Existing, true));
    }

    /// Ba luật "bắt đầu từ 0", và app bị tắt sau khi ghi bộ đếm mà trước khi ghi bản ghi đánh dấu: lần sau token không
    /// còn `fresh`, vẫn dùng đúng bộ đếm đã ghi, không bị coi là mất bản ghi (notes-for-plan06 mục 3).
    #[test]
    fn the_three_fresh_rules_survive_a_crash_between_the_two_writes() {
        let base = claims();
        let mut next_epoch = base.clone();
        next_epoch.quota_epoch = 1;
        let mut next_cycle = base.clone();
        next_cycle.issued_at = T0 + CYCLE_SECS + 10;
        let cases = [
            ("token fresh", base.clone(), true, None),
            ("epoch lớn hơn", next_epoch, false, Some(marker(&base))),
            ("chu kỳ mới", next_cycle, false, Some(marker(&base))),
        ];
        for (name, c, fresh, old_marker) in cases {
            let first = resolve_paid(&c, fresh, None, old_marker.as_ref());
            assert_eq!(first.resolution, Resolution::Fresh, "{name}");
            assert_eq!(
                (first.counter.used_ms, first.write_counter, first.write_marker),
                (0, true, true),
                "{name}"
            );
            let mut used = first.counter.clone();
            used.used_ms = 3 * MIN;
            // Chỉ bộ đếm đã ghi; bản ghi đánh dấu vẫn là bản cũ (hay chưa có).
            let again = resolve_paid(&c, false, Some(used), old_marker.as_ref());
            assert_eq!(
                (again.resolution, again.counter.used_ms, again.write_marker),
                (Resolution::Existing, 3 * MIN, true),
                "{name}"
            );
        }
    }

    #[test]
    fn a_marker_without_its_counter_means_the_record_was_lost() {
        let c = claims();
        let s = resolve_paid(&c, false, None, Some(&marker(&c)));
        assert_eq!(s.resolution, Resolution::Lost);
        assert!(s.counter.lost);
        assert_eq!(paid_remaining(&c, &s.counter), Some(0), "coi như đã dùng hết cả chu kỳ");
        // Không có bản ghi nào của activation này, token không `fresh` (xóa sạch dữ liệu quá cửa sổ 15 phút).
        assert_eq!(resolve_paid(&c, false, None, None).resolution, Resolution::Lost);
        // Trong cửa sổ `fresh`, bắt đầu từ 0 đứng trước mất bản ghi (rủi ro chấp nhận, §10.2).
        assert_eq!(
            resolve_paid(&c, true, None, Some(&marker(&c))).resolution,
            Resolution::Fresh
        );
    }

    /// Admin tăng `quota_epoch` (đường cứu): máy còn bản ghi đánh dấu thì bắt đầu từ 0 ngay cả khi cửa sổ đã đóng; máy đã
    /// xóa sạch dữ liệu chỉ được cứu trong cửa sổ `fresh` (notes-for-plan06 mục 3).
    #[test]
    fn a_new_epoch_starts_over_with_a_marker_or_inside_the_fresh_window() {
        let base = claims();
        let mut bumped = base.clone();
        bumped.quota_epoch = 1;
        assert_eq!(
            resolve_paid(&bumped, false, None, Some(&marker(&base))).resolution,
            Resolution::Fresh
        );
        assert_eq!(resolve_paid(&bumped, false, None, None).resolution, Resolution::Lost);
        assert_eq!(resolve_paid(&bumped, true, None, None).resolution, Resolution::Fresh);
        // Epoch nhỏ hơn bản ghi đánh dấu (bản ghi bị sửa tay): không mở bộ đếm mới.
        let mut m = marker(&base);
        m.epoch = 2;
        assert_eq!(
            resolve_paid(&bumped, false, None, Some(&m)).resolution,
            Resolution::Lost
        );
    }

    /// Đổi gói đặt lại `cycle_anchor` (notes-for-plan06 mục 3): có bản ghi đánh dấu của mốc cũ thì bắt đầu từ 0; không có
    /// thì chỉ bắt đầu từ 0 khi token `fresh`.
    #[test]
    fn changing_plan_starts_a_new_counter_with_or_without_a_marker() {
        let old = claims();
        let mut changed = old.clone();
        changed.plan = Plan::Yearly;
        changed.quota_minutes_per_cycle = Some(6000);
        changed.cycle_anchor = T0 + 10 * DAY_SECS;
        changed.issued_at = T0 + 10 * DAY_SECS + 60;
        assert_eq!(
            resolve_paid(&changed, false, None, Some(&marker(&old))).resolution,
            Resolution::Fresh
        );
        assert_eq!(resolve_paid(&changed, true, None, None).resolution, Resolution::Fresh);
        assert_eq!(resolve_paid(&changed, false, None, None).resolution, Resolution::Lost);
        // Bộ đếm của gói cũ không dùng cho gói mới.
        assert_eq!(
            resolve_paid(&changed, false, Some(counter(&old, 100 * MIN)), Some(&marker(&old)))
                .counter
                .used_ms,
            0
        );
    }

    /// Bản ghi của activation khác (cài lại hệ điều hành, server tạo activation mới cho cùng máy) không được dùng.
    #[test]
    fn records_of_another_activation_are_not_used() {
        let c = claims();
        let mut other = claims();
        other.activation_id = "act-2".into();
        assert_eq!(
            resolve_paid(&c, false, Some(counter(&other, MIN)), None).resolution,
            Resolution::Lost
        );
        let mut m = marker(&c);
        m.cycle_start -= CYCLE_SECS;
        m.activation_id = "act-2".into();
        assert_eq!(resolve_paid(&c, false, None, Some(&m)).resolution, Resolution::Lost);
    }

    fn vn() -> FixedOffset {
        FixedOffset::east_opt(7 * 3600).unwrap()
    }

    /// 2026-10-01 08:00 giờ Việt Nam.
    const MORNING: i64 = T0 + 3600;

    #[test]
    fn free_starts_at_zero_on_the_first_run_and_is_used_up_when_its_record_is_lost() {
        let seen = Seen::default();
        let (c, write) = resolve_free(&vn(), None, false, MORNING, &seen);
        assert_eq!((c.used_ms, c.lost, write), (0, false, true));
        assert_eq!(c.day, NaiveDate::from_ymd_opt(2026, 10, 1).unwrap());
        let (c, write) = resolve_free(&vn(), None, true, MORNING, &seen);
        assert_eq!((free_remaining(&c), c.lost, write), (0, true, true));
    }

    #[test]
    fn free_resets_only_on_a_new_day_after_20_real_hours() {
        let seen = Seen {
            max_machine: MORNING,
            latest_server_date: None,
        };
        let mut c = free_start(&vn(), MORNING, &seen);
        c.used_ms = FREE_DAILY_MS;
        // 23:30 cùng ngày: chưa qua ngày.
        let late = MORNING + 15 * 3600 + 1800;
        assert!(!resolve_free(&vn(), Some(c.clone()), true, late, &seen).1);
        // 00:30 hôm sau nhưng mới 16 giờ rưỡi: chưa đủ 20 giờ.
        let after_midnight = MORNING + 16 * 3600 + 1800;
        assert!(!resolve_free(&vn(), Some(c.clone()), true, after_midnight, &seen).1);
        // 04:00 hôm sau, đủ 20 giờ: reset.
        let (r, write) = resolve_free(&vn(), Some(c.clone()), true, MORNING + 20 * 3600, &seen);
        assert!(write);
        assert_eq!((r.used_ms, r.day), (0, NaiveDate::from_ymd_opt(2026, 10, 2).unwrap()));
        assert_eq!(
            free_reset_time(&vn(), &c),
            MORNING + 20 * 3600,
            "max(00:00 hôm sau, reset + 20 giờ)"
        );
        let mut evening = free_start(&vn(), MORNING + 12 * 3600, &seen);
        evening.used_ms = 1;
        assert_eq!(
            free_reset_time(&vn(), &evening),
            MORNING + 32 * 3600,
            "reset lúc 20:00 thì mở lại lúc 16:00 hôm sau"
        );
    }

    /// Chỉnh đồng hồ lùi hay đổi múi giờ qua lại không mở được Free; thời gian đơn điệu và header `Date` của server vẫn đếm.
    #[test]
    fn moving_the_clock_does_not_reset_free_but_real_time_does() {
        let mut seen = Seen {
            max_machine: MORNING + 30 * 3600,
            latest_server_date: None,
        };
        let c = free_start(&vn(), MORNING, &seen);
        // Đã từng thấy giờ máy tới +30 giờ rồi chỉnh lùi về +21 giờ: hiệu giờ máy không được tính.
        let back = MORNING + 21 * 3600;
        assert!(seen.rolled_back(back));
        assert!(!resolve_free(&vn(), Some(c.clone()), true, back, &seen).1);
        // Nhưng thời gian đơn điệu lúc app chạy đã đủ 20 giờ.
        let mut ran = c.clone();
        ran.monotonic_ms = 20 * 3600 * 1000;
        assert!(resolve_free(&vn(), Some(ran), true, back, &seen).1);
        // Hoặc hai header `Date` của server cách nhau đủ 20 giờ (server thấy +30 giờ: giờ máy +21 giờ đúng là bị chỉnh lùi).
        let mut dated = c.clone();
        dated.server_date_at_reset = Some(MORNING + 10 * 3600);
        seen.observe_server(MORNING + 30 * 3600);
        assert!(seen.rolled_back(back));
        assert!(resolve_free(&vn(), Some(dated.clone()), true, back, &seen).1);
        // Chỉ có `Date` sau lần reset, không có `Date` trước đó: số này không dùng.
        dated.server_date_at_reset = None;
        assert!(!resolve_free(&vn(), Some(dated), true, back, &seen).1);
        // Đổi múi giờ sang +14 cho ngày tăng sớm: vẫn cần đủ 20 giờ.
        let east = FixedOffset::east_opt(14 * 3600).unwrap();
        let c2 = free_start(&vn(), MORNING, &Seen::default());
        assert!(!resolve_free(&east, Some(c2), true, MORNING + 11 * 3600, &Seen::default()).1);
    }

    /// Bộ đếm Free reset lúc giờ máy đặt nhầm tới trước (Q2 của review 06 lần 1): giờ máy về đúng thì kéo `day`, `reset_at`
    /// về hiện tại, giữ phút đã dùng; lần reset kế tiếp theo luật thường (sang ngày mới và 20 giờ đồng hồ thật). Chiều
    /// ngược lại (chỉnh lùi sau khi đã dùng hết) không mở được phút nào.
    #[test]
    fn a_free_counter_from_a_clock_set_ahead_is_pulled_back_without_new_minutes() {
        let ahead = MORNING + 365 * DAY_SECS;
        let mut used = free_start(&vn(), ahead, &Seen::default());
        used.used_ms = FREE_DAILY_MS;
        used.monotonic_ms = 3600 * 1000;
        let dated = Seen {
            max_machine: MORNING,
            latest_server_date: Some(MORNING),
        };
        let (mut pulled, write) = resolve_free(&vn(), Some(used), true, MORNING, &dated);
        assert_eq!(pulled.server_date_at_reset, None, "không lấy `Date` cũ làm mốc");
        // `Date` đầu tiên sau khi kéo về làm mốc (manager ghi ở `observe`).
        pulled.server_date_at_reset = Some(MORNING);
        assert!(write);
        assert_eq!((pulled.day, pulled.reset_at), (local_day(&vn(), MORNING), MORNING));
        assert_eq!(pulled.used_ms, FREE_DAILY_MS, "không mở thêm phút nào");
        assert_eq!(
            pulled.monotonic_ms,
            3600 * 1000,
            "thời gian đơn điệu đã đếm vẫn là thời gian thật"
        );
        assert!(!resolve_free(&vn(), Some(pulled.clone()), true, MORNING + 3600, &Seen::default()).1);
        // Hôm sau: giờ máy chưa tin lại được (QB của review 06 lần 2), nên reset nhờ hiệu `Date` hay 20 giờ app chạy; không
        // kẹt tới năm sau.
        assert!(!resolve_free(&vn(), Some(pulled.clone()), true, MORNING + 21 * 3600, &dated).1);
        let later = Seen {
            max_machine: MORNING + 21 * 3600,
            latest_server_date: Some(MORNING + 21 * 3600),
        };
        let (next, reset) = resolve_free(&vn(), Some(pulled.clone()), true, MORNING + 21 * 3600, &later);
        assert!(reset && next.used_ms == 0 && !next.clock_pulled, "hiệu `Date` 21 giờ");
        let mut ran = pulled;
        ran.monotonic_ms = 20 * 3600 * 1000;
        assert!(
            resolve_free(&vn(), Some(ran), true, MORNING + 21 * 3600, &dated).1,
            "20 giờ app chạy"
        );
        // Chiều ngược lại: dùng hết hôm nay rồi chỉnh lùi hai ngày, rồi đặt tới "ngày mai" của ngày giả.
        let mut today = free_start(&vn(), MORNING, &Seen::default());
        today.used_ms = FREE_DAILY_MS;
        let seen = Seen {
            max_machine: MORNING,
            latest_server_date: None,
        };
        let back = MORNING - 2 * DAY_SECS;
        let (c, _) = resolve_free(&vn(), Some(today), true, back, &seen);
        assert_eq!(c.used_ms, FREE_DAILY_MS);
        let (c, reset) = resolve_free(&vn(), Some(c), true, back + DAY_SECS, &seen);
        assert!(
            !reset && c.used_ms == FREE_DAILY_MS,
            "chưa đủ 20 giờ thật: không mở phút nào"
        );
    }

    /// Đặt giờ tới trước rồi lùi về, lặp lại với cùng độ lệch (QB của review 06 lần 2): lần tiến đầu reset được (rủi ro đã
    /// chấp nhận ở §10.2), nhưng bộ đếm vừa kéo về bỏ hiệu giờ máy tới lần reset sau, nên lần tiến thứ hai không mở thêm
    /// phút nào, kể cả khi `Date` của server đã hạ mốc giờ máy.
    #[test]
    fn forward_back_forward_with_the_same_offset_gives_no_new_minutes() {
        let mut c = free_start(&vn(), MORNING, &Seen::default());
        c.used_ms = FREE_DAILY_MS;
        let ahead = MORNING + DAY_SECS;
        let (mut c, reset) = resolve_free(&vn(), Some(c), true, ahead, &Seen::default());
        assert!(reset, "lần tiến đầu: rủi ro đã chấp nhận");
        c.used_ms = FREE_DAILY_MS;
        let real = Seen {
            max_machine: MORNING + 60,
            latest_server_date: Some(MORNING + 60),
        };
        let (c, _) = resolve_free(&vn(), Some(c), true, MORNING + 60, &real);
        assert!(c.clock_pulled && c.used_ms == FREE_DAILY_MS);
        for round in 1..=5 {
            let again = ahead + round * 120;
            let (next, reset) = resolve_free(&vn(), Some(c.clone()), true, again, &real);
            assert!(
                !reset && next.used_ms == FREE_DAILY_MS,
                "lần tiến thứ {round}: không mở phút nào"
            );
        }
    }

    /// `issued_at` đã ký của token là một mốc giờ của server (QA của review 06 lần 2): nâng mốc so sánh của chỉnh lùi và giờ
    /// tin được, nhưng không hạ giờ máy lớn nhất từng thấy (token có thể đã cấp từ nhiều ngày trước).
    #[test]
    fn the_signed_issue_time_counts_as_server_time() {
        let mut seen = Seen {
            max_machine: T0 + DAY_SECS,
            latest_server_date: None,
        };
        seen.observe_signed(T0);
        assert_eq!(seen.max_machine, T0 + DAY_SECS);
        assert_eq!(seen.latest_server_date, Some(T0));
        let mut slow = Seen::default();
        slow.observe_machine(T0 - 365 * DAY_SECS);
        slow.observe_signed(T0);
        assert!(slow.rolled_back(T0 - 365 * DAY_SECS + 60));
    }

    /// Đổi múi giờ về phía tây (người trung thực bay sang Mỹ; N2 của review 06 lần 3): ngày theo giờ máy lùi mà giờ Unix không
    /// lùi, nên chỉ kéo `day` về, giữ `reset_at` và không đánh dấu `clock_pulled`; reset như thường khi sang ngày mới theo giờ
    /// mới và đủ 20 giờ.
    #[test]
    fn moving_to_a_western_time_zone_does_not_distrust_the_clock() {
        let early = T0 - 7 * 3600 + 1800; // 00:30 giờ Việt Nam
        let mut c = free_start(&vn(), early, &Seen::default());
        c.used_ms = FREE_DAILY_MS;
        let west = FixedOffset::west_opt(7 * 3600).unwrap();
        let (c, _) = resolve_free(&west, Some(c), true, early + 10 * 3600, &Seen::default());
        assert!(!c.clock_pulled && c.reset_at == early && c.used_ms == FREE_DAILY_MS);
        let (c, reset) = resolve_free(&west, Some(c), true, early + 40 * 3600, &Seen::default());
        assert!(reset && c.used_ms == 0);
    }

    /// Free chỉ reset khi sang ngày mới theo giờ máy, kể cả khi đã qua 20 giờ (§6.8).
    #[test]
    fn free_needs_a_new_day_as_well_as_twenty_hours() {
        let early = T0 - 7 * 3600 + 1800; // 00:30 giờ Việt Nam
        let mut ran = free_start(&vn(), early, &Seen::default());
        ran.monotonic_ms = 20 * 3600 * 1000;
        let same_day = early + 20 * 3600;
        assert!(
            !resolve_free(&vn(), Some(ran.clone()), true, same_day, &Seen::default()).1,
            "20:30 cùng ngày"
        );
        assert!(resolve_free(&vn(), Some(ran), true, early + 24 * 3600, &Seen::default()).1);
    }

    #[test]
    fn the_rollback_tolerance_is_ten_minutes() {
        let mut seen = Seen::default();
        seen.observe_machine(T0);
        seen.observe_machine(T0 - 3600);
        assert_eq!(seen.max_machine, T0);
        assert!(!seen.rolled_back(T0 - ROLLBACK_TOLERANCE_SECS));
        assert!(seen.rolled_back(T0 - ROLLBACK_TOLERANCE_SECS - 1));
        seen.observe_server(T0);
        seen.observe_server(T0 - 5);
        assert_eq!(seen.latest_server_date, Some(T0));
        // Giờ máy từng đặt tới trước một năm rồi chỉnh lại: header `Date` của server hạ mốc về giờ thật.
        let mut ahead = Seen::default();
        ahead.observe_machine(T0 + 365 * DAY_SECS);
        assert!(ahead.rolled_back(T0));
        ahead.observe_server(T0 + ROLLBACK_TOLERANCE_SECS);
        assert!(!ahead.rolled_back(T0), "mốc đã về giờ server");
        ahead.observe_server(T0);
        assert!(
            ahead.rolled_back(T0 - ROLLBACK_TOLERANCE_SECS - 1),
            "chỉnh lùi thật vẫn bị phát hiện"
        );
    }

    /// Giờ máy chậm hơn header `Date` của server quá 10 phút cũng là chỉnh lùi, kể cả khi giờ máy đã chậm từ trước lần
    /// mở app đầu tiên (Q1 của review 06 lần 1). Giờ tin được là giờ lớn hơn trong hai giờ.
    #[test]
    fn a_machine_clock_behind_the_server_is_rolled_back() {
        let year = 365 * DAY_SECS;
        let mut seen = Seen::default();
        seen.observe_machine(T0 - year);
        seen.observe_server(T0);
        assert!(seen.rolled_back(T0 - year + 60));
        assert_eq!(seen.trusted_now(T0 - year + 60), T0);
        assert!(!seen.rolled_back(T0 - ROLLBACK_TOLERANCE_SECS));
        assert_eq!(seen.trusted_now(T0 + 60), T0 + 60);
    }
}
