import { type ReactNode, useMemo } from "react";
import { App as AntApp } from "antd";
import type { ConfigProviderProps, ModalFuncProps } from "antd";
import {
  IconAlertCircleFilled,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconCircleCheckFilled,
  IconCircleXFilled,
  IconEye,
  IconEyeOff,
  IconInfoCircleFilled,
  IconSearch,
  IconX,
  type Icon,
} from "@tabler/icons-react";

// Props for every Tabler icon. The icons are decorative: the button's
// aria-label or the text beside them carries the meaning, so keep them out
// of the accessibility tree and, in old Edge/IE, out of the tab order.
export const decorative = { "aria-hidden": true, focusable: "false" } as const;

// A Tabler icon in Ant Design's own icon slot. The `anticon` wrapper keeps
// antd's sizing, spacing and status colours, and 1em follows its font size.
export function antIcon(Glyph: Icon, stroke = 2): ReactNode {
  return (
    <span className="anticon" role="img" aria-hidden="true">
      <Glyph size="1em" stroke={stroke} {...decorative} />
    </span>
  );
}

export const statusIcon = {
  success: antIcon(IconCircleCheckFilled),
  error: antIcon(IconCircleXFilled),
  info: antIcon(IconInfoCircleFilled),
  warning: antIcon(IconAlertCircleFilled),
};

export const chevronDown = antIcon(IconChevronDown);
export const numberControls = {
  upIcon: antIcon(IconChevronUp),
  downIcon: antIcon(IconChevronDown),
};

// Replaces the glyphs Ant Design draws inside its components, so every
// window shows Tabler icons only. Status icons in messages, confirmations,
// alerts and popconfirms are not configurable here: use useAntApp and
// statusIcon instead.
export const antdIconConfig: ConfigProviderProps = {
  select: {
    suffixIcon: chevronDown,
    removeIcon: antIcon(IconX),
    clearIcon: statusIcon.error,
    menuItemSelectedIcon: antIcon(IconCheck),
  },
  input: { allowClear: { clearIcon: statusIcon.error } },
  textArea: { allowClear: { clearIcon: statusIcon.error } },
  inputPassword: {
    iconRender: (visible) => antIcon(visible ? IconEye : IconEyeOff),
  },
  inputSearch: { searchIcon: antIcon(IconSearch) },
  modal: { closeIcon: antIcon(IconX) },
  tag: { closeIcon: antIcon(IconX) },
  alert: { closeIcon: antIcon(IconX) },
};

type Notice = (content: ReactNode) => void;

// AntApp.useApp with Tabler status icons on messages and confirmations.
export function useAntApp() {
  const { message, modal } = AntApp.useApp();
  return useMemo(() => {
    const notice =
      (type: keyof typeof statusIcon): Notice =>
      (content) =>
        void message.open({ type, content, icon: statusIcon[type] });
    return {
      message: {
        success: notice("success"),
        error: notice("error"),
        info: notice("info"),
        warning: notice("warning"),
      },
      modal: {
        confirm: (props: ModalFuncProps) =>
          modal.confirm({ icon: statusIcon.warning, ...props }),
      },
    };
  }, [message, modal]);
}
