import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../context";

export function usePageComposer({
  isEditing = false,
  onReset,
}: {
  isEditing?: boolean;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { registerPageComposer } = useApp();
  const onResetRef = useRef(onReset);
  onResetRef.current = onReset;

  const showComposer = open || isEditing;

  const closeComposer = useCallback(() => {
    onResetRef.current();
    setOpen(false);
  }, []);

  const openComposer = useCallback(() => {
    setOpen(true);
  }, []);

  useEffect(() => {
    registerPageComposer({
      active: showComposer,
      onAdd: openComposer,
      onCancel: closeComposer,
    });
    return () => registerPageComposer(null);
  }, [showComposer, openComposer, closeComposer, registerPageComposer]);

  return { showComposer, openComposer, closeComposer };
}
