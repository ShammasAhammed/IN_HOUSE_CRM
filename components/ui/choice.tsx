"use client";

// Dropdowns and checkboxes that keep what the person picked (test report H1). React resets a form after its action
// runs, and an uncontrolled <select> or checkbox then snaps back to the value it had when the page first loaded, even
// when the server has since sent a new default. These keep the choice in state instead: it changes when the person
// picks, and when the server sends a different default (after a save, or the submitted values after an error).
import * as React from "react";
import { cn } from "@/lib/utils";

/** The person's choice, re-seeded only when the default the server sends changes. */
function useKept<T>(initial: T): [T, (v: T) => void] {
  const [kept, setKept] = React.useState(initial);
  const [seen, setSeen] = React.useState(initial);
  if (!Object.is(seen, initial) && JSON.stringify(seen) !== JSON.stringify(initial)) {
    setSeen(initial);
    setKept(initial);
  }
  return [kept, setKept];
}

/**
 * React's form reset runs the browser's reset, which sets the element back to its first-load default behind React's
 * back. Put the kept value back right after any reset of the element's form.
 */
function useSurviveReset<E extends HTMLSelectElement | HTMLInputElement>(apply: (el: E) => void) {
  const ref = React.useRef<E>(null);
  const latest = React.useRef(apply);
  React.useEffect(() => {
    latest.current = apply;
  });
  React.useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    // The reset event fires before the browser resets the fields, so restore on the next task.
    const onReset = () => setTimeout(() => ref.current && latest.current(ref.current), 0);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return ref;
}

type SelectProps = React.ComponentProps<"select">;

function UncontrolledSelect({ defaultValue, onChange, ...props }: SelectProps) {
  const [value, setValue] = useKept(defaultValue);
  const ref = useSurviveReset<HTMLSelectElement>((el) => {
    const want = Array.isArray(value) ? value.map(String) : [String(value)];
    for (const o of Array.from(el.options)) o.selected = want.includes(o.value);
  });
  return (
    <select
      {...props}
      ref={ref}
      value={value}
      onChange={(e) => {
        setValue(props.multiple ? Array.from(e.currentTarget.selectedOptions, (o) => o.value) : e.currentTarget.value);
        onChange?.(e);
      }}
    />
  );
}

/** Controlled by the caller: still put its value back after a form reset. */
function ControlledSelect(props: SelectProps) {
  const ref = useSurviveReset<HTMLSelectElement>((el) => {
    const want = Array.isArray(props.value) ? props.value.map(String) : [String(props.value)];
    for (const o of Array.from(el.options)) o.selected = want.includes(o.value);
  });
  return <select {...props} ref={ref} />;
}

export function KeptSelect(props: SelectProps) {
  if (props.value !== undefined) return <ControlledSelect {...props} />;
  // No default to keep (the browser shows the first option): leave it as it is.
  if (props.defaultValue === undefined) return <select {...props} />;
  return <UncontrolledSelect {...props} />;
}

type CheckboxProps = Omit<React.ComponentProps<"input">, "type">;

function UncontrolledCheckbox({ defaultChecked, onChange, ...props }: CheckboxProps) {
  const [checked, setChecked] = useKept(Boolean(defaultChecked));
  const ref = useSurviveReset<HTMLInputElement>((el) => {
    el.checked = checked;
  });
  return (
    <input
      {...props}
      ref={ref}
      type="checkbox"
      checked={checked}
      onChange={(e) => {
        setChecked(e.currentTarget.checked);
        onChange?.(e);
      }}
    />
  );
}

function ControlledCheckbox(props: CheckboxProps) {
  const ref = useSurviveReset<HTMLInputElement>((el) => {
    el.checked = Boolean(props.checked);
  });
  return <input {...props} ref={ref} type="checkbox" />;
}

/** A checkbox that keeps its tick through a form reset. */
export function Checkbox({ className, ...props }: CheckboxProps) {
  const cls = cn("size-4 accent-primary", className);
  if (props.checked !== undefined) return <ControlledCheckbox {...props} className={cls} />;
  return <UncontrolledCheckbox {...props} className={cls} />;
}
