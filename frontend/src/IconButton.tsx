import type { ReactNode } from "react";
import { Button, Tooltip } from "antd";
import type { ButtonProps, TooltipProps } from "antd";

type Props = {
  // Accessible name in the current locale.
  label: string;
  // Tooltip in the current locale. Defaults to the accessible name.
  tooltip?: string;
  icon: ReactNode;
  placement?: TooltipProps["placement"];
} & Pick<
  ButtonProps,
  "className" | "danger" | "disabled" | "onClick" | "size" | "type"
>;

// Icon-only control for an action people already recognise from the glyph
// (play, undo, and the same kind of editor or media control). Domain actions
// keep their text and do not use this.
//
// A disabled button does not receive pointer events, so the tooltip is on the
// wrapper. The icon stays out of the accessibility tree; the label does not.
export default function IconButton({
  label,
  tooltip,
  icon,
  placement,
  disabled,
  className,
  ...rest
}: Props) {
  return (
    <Tooltip title={tooltip ?? label} placement={placement}>
      <span className="icon-hit">
        <Button
          {...rest}
          className={className}
          aria-label={label}
          disabled={disabled}
          icon={icon}
        />
      </span>
    </Tooltip>
  );
}
