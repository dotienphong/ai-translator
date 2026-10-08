// Nút dùng chung (spec giao diện mới, mục 2): bốn kiểu (chính, phụ, không viền, nguy hiểm; nguy hiểm có bản nền đặc), ba cỡ,
// trạng thái đang xử lý (vòng quay, khóa bấm đúp). Có thể là thẻ <a> (href, link ngoài) hay Link của router (to).
// Lớp CSS dùng lại tên cũ (primary, ghost, danger solid, small) để nút trần của các trang chưa viết lại trông y hệt: base.css.
import {
  type ButtonHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  type Ref,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link } from "../router";
import { Spinner } from "./icons";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "danger-solid";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: "primary",
  secondary: "",
  ghost: "ghost",
  danger: "danger",
  "danger-solid": "danger solid",
};
const SIZE_CLASS: Record<ButtonSize, string> = { sm: "small", md: "", lg: "large" };

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Biểu tượng trước chữ (thay bằng vòng quay khi đang xử lý). */
  icon?: ReactNode;
  /** Biểu tượng sau chữ (mũi tên, link ngoài…). */
  iconEnd?: ReactNode;
  /**
   * Đang xử lý: vòng quay thay biểu tượng, bỏ qua mọi lần bấm (khóa bấm đúp), aria-busy. Nút vẫn nhận focus (không mất
   * chỗ đứng của người dùng bàn phím); muốn khóa hẳn thì truyền thêm disabled.
   */
  loading?: boolean;
  /** Trải hết chiều ngang. */
  block?: boolean;
  /** onClick trả Promise: nút tự vào trạng thái đang xử lý tới khi Promise xong, bấm thêm trong lúc đó bị bỏ qua. */
  onClick?: (e: MouseEvent<HTMLElement>) => void | Promise<unknown>;
  /** Thành thẻ <a href> (link ngoài, tải tệp…). */
  href?: string;
  /** Thành Link của router (trang nội bộ). */
  to?: string;
  target?: string;
  rel?: string;
  ref?: Ref<HTMLButtonElement & HTMLAnchorElement>;
}

export function buttonClass({
  variant = "secondary",
  size = "md",
  block,
  busy,
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  busy?: boolean;
  className?: string;
}): string {
  return ["btn", VARIANT_CLASS[variant], SIZE_CLASS[size], block && "block", busy && "is-loading", className].filter(Boolean).join(" ");
}

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  iconEnd,
  loading = false,
  block,
  onClick,
  href,
  to,
  target,
  rel,
  type = "button",
  className,
  children,
  disabled,
  ref,
  ...rest
}: ButtonProps) {
  // Chốt đồng bộ cho onClick trả Promise: hai lần bấm trong cùng một lượt cập nhật vẫn chỉ chạy một lần.
  const pending = useRef(false);
  const [auto, setAuto] = useState(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const busy = loading || auto;

  function handle(e: MouseEvent<HTMLElement>) {
    if (busy || disabled || pending.current) {
      e.preventDefault();
      return;
    }
    const r = onClick?.(e);
    if (r && typeof (r as Promise<unknown>).then === "function") {
      pending.current = true;
      setAuto(true);
      const done = () => {
        pending.current = false;
        if (alive.current) setAuto(false);
      };
      (r as Promise<unknown>).then(done, done);
    }
  }

  const cls = buttonClass({ variant, size, block, busy, className });
  const iconSize = size === "sm" ? 16 : 18;
  const lead = busy ? <Spinner size={iconSize} /> : icon;
  const body = (
    <>
      {lead}
      {children !== undefined && children !== null && children !== false && <span className="btn-label">{children}</span>}
      {iconEnd}
    </>
  );

  if (href !== undefined || to !== undefined) {
    // Link không có trạng thái disabled: bỏ href (không đi đâu) và báo aria-disabled.
    const off = disabled || busy;
    const linkProps = {
      className: cls,
      "aria-label": rest["aria-label"],
      "aria-describedby": rest["aria-describedby"],
      "aria-disabled": off ? true : undefined,
      "aria-busy": busy || undefined,
      title: rest.title,
      id: rest.id,
      onClick: handle,
    };
    if (to !== undefined && !off) {
      return (
        <Link to={to} {...linkProps}>
          {body}
        </Link>
      );
    }
    return (
      <a {...linkProps} ref={ref} href={off ? undefined : href} target={target} rel={target === "_blank" ? (rel ?? "noopener noreferrer") : rel}>
        {body}
      </a>
    );
  }

  return (
    <button
      {...rest}
      ref={ref}
      type={type}
      className={cls}
      disabled={disabled}
      aria-busy={busy || undefined}
      onClick={handle}
    >
      {body}
    </button>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, "children" | "icon" | "iconEnd" | "aria-label" | "block"> {
  /** Tên của nút cho trình đọc màn hình và tooltip (bắt buộc: nút chỉ có biểu tượng). */
  label: string;
  icon: ReactNode;
  /** Mặc định ghost (không viền). */
  variant?: ButtonVariant;
}

/** Nút chỉ có biểu tượng, vuông, cùng chiều cao với nút thường. Tên lấy từ `label` (aria-label và title). */
export function IconButton({ label, icon, variant = "ghost", className, title, ...rest }: IconButtonProps) {
  return <Button {...rest} variant={variant} aria-label={label} title={title ?? label} icon={icon} className={className ? `icon-only ${className}` : "icon-only"} />;
}

/** Nhóm nút: cách đều, tự xuống dòng; `attached` thì dính liền thành một khối (thanh công cụ nhỏ). */
export function ButtonGroup({
  children,
  label,
  attached = false,
  align = "start",
  className,
}: {
  children: ReactNode;
  /** Tên nhóm cho trình đọc màn hình (role="group"). */
  label?: string;
  attached?: boolean;
  align?: "start" | "end" | "between";
  className?: string;
}) {
  const cls = ["btn-group", attached && "attached", align !== "start" && `align-${align}`, className].filter(Boolean).join(" ");
  return (
    <div className={cls} role="group" aria-label={label}>
      {children}
    </div>
  );
}
