/**
 * Camera guards: keep zoom on the map, off the page.
 *
 * Mirrored from age-of-agents `packages/client/src/game/camera-guards.ts` (MIT,
 * see THIRD-PARTY-NOTICES.md), including the Polish comments upstream keeps,
 * because they explain the Safari `gesture*` half that a translation would lose.
 *
 * The problem is narrow and real: a trackpad pinch arrives as a `wheel` event
 * with `ctrlKey` set, and Safari sends `gesturestart`/`gesturechange` instead.
 * The browser treats both as PAGE zoom, so without an intercept, pinching the
 * Coding City scales the bounty board's nav and the agent card beside it. The
 * guard calls `preventDefault` and lets pixi-viewport handle the zoom itself.
 */

/**
 * Installs the guards and returns an uninstall function.
 *
 * Both the host's `touch-action` and the document's `overscroll-behavior` are
 * saved and restored. They are not ours to set permanently: a host that also
 * hosts a scrollable panel needs the body's original behaviour back, and a
 * client that has torn itself down and left `overscroll-behavior: none` behind
 * breaks scrolling on the rest of the page.
 */
export function installCameraGuards(host: HTMLElement): () => void {
  const previousTouchAction = host.style.touchAction;
  const previousOverscroll = document.body.style.overscrollBehavior;
  host.style.touchAction = 'none';
  document.body.style.overscrollBehavior = 'none';

  const onWheel = (event: WheelEvent): void => {
    if (event.ctrlKey) event.preventDefault();
  };
  const onGesture = (event: Event): void => {
    event.preventDefault();
  };

  host.addEventListener('wheel', onWheel, { passive: false });
  host.addEventListener('gesturestart', onGesture, { passive: false });
  host.addEventListener('gesturechange', onGesture, { passive: false });
  host.addEventListener('gestureend', onGesture, { passive: false });

  return () => {
    host.style.touchAction = previousTouchAction;
    document.body.style.overscrollBehavior = previousOverscroll;
    host.removeEventListener('wheel', onWheel);
    host.removeEventListener('gesturestart', onGesture);
    host.removeEventListener('gesturechange', onGesture);
    host.removeEventListener('gestureend', onGesture);
  };
}
