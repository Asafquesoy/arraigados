import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";
import "./PasswordInput.css";

type PasswordInputProps = Omit<ComponentPropsWithoutRef<"input">, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      <input
        {...props}
        ref={ref}
        type={visible ? "text" : "password"}
        className={className}
      />
      <button
        type="button"
        className="password-input-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        title={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
        aria-pressed={visible}
        tabIndex={0}
      >
        {visible ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
      </button>
    </div>
  );
});
