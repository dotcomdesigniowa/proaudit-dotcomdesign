import { useState, useCallback } from "react";
import { createPortal } from "react-dom";

interface InfoTipProps {
  label: string;
  className?: string;
  children: React.ReactNode;
}

const InfoTip = ({ label, className = "", children }: InfoTipProps) => {
  const [open, setOpen] = useState(false);

  const toggle = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((v) => !v);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return (
    <>
      <span className={`tipHost ${className}`} onClick={toggle}>
        {label}
      </span>
      {open &&
        createPortal(
          <>
            <div className="tipBackdrop" onClick={close} />
            <div className="tipModal">{children}</div>
          </>,
          document.body
        )}
    </>
  );
};

export default InfoTip;
