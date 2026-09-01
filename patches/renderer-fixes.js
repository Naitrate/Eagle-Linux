// Renderer fixes: window.ig fallback and CSS body display fix
//
// These only apply when the compatibility layer is evaluated inside a
// renderer process; in the main process both guards are false and the
// module is a no-op.

if (typeof window !== 'undefined') {
  let _ig = undefined;
  try {
    Object.defineProperty(window, 'ig', {
      get() {
        if (_ig) return _ig;
        return { getItems: () => [], render: () => {}, layout: () => {} };
      },
      set(v) { _ig = v; },
      configurable: true,
      enumerable: true
    });
  } catch (e) {}
}

if (typeof document !== 'undefined') {
  const showBody = () => {
    try {
      if (document.head) {
        const style = document.createElement('style');
        style.id = 'stubs-body-fix';
        style.innerHTML = 'body { display: block !important; }';
        document.head.appendChild(style);
      }
    } catch (e) {}
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBody);
  } else {
    showBody();
  }
}
