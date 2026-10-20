import { useEffect } from "react";

export function TextScaleController({ textSize }: { textSize: number }) {
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;
    const scale = String(textSize / 100);
    const selector = "[data-cloudpainter-text-scale]";
    const record = (element: Element) => {
      if (element instanceof HTMLElement || element instanceof SVGElement) {
        element.style.setProperty("--cloudpainter-base-font-size", getComputedStyle(element).fontSize);
        element.setAttribute("data-cloudpainter-text-scale", "");
      }
    };
    const recordTree = (node: Node) => {
      if (!(node instanceof Element)) return;
      record(node);
      node.querySelectorAll("*").forEach(record);
    };

    root.style.setProperty("--cloudpainter-text-scale", "1");
    root.querySelectorAll(selector).forEach(element => {
      element.removeAttribute("data-cloudpainter-text-scale");
      (element as HTMLElement | SVGElement).style.removeProperty("--cloudpainter-base-font-size");
    });
    root.querySelectorAll("*").forEach(record);
    root.style.setProperty("--cloudpainter-text-scale", scale);

    const observer = new MutationObserver(records => {
      const added = records.flatMap(record => [...record.addedNodes]);
      if (!added.length) return;
      root.style.setProperty("--cloudpainter-text-scale", "1");
      added.forEach(recordTree);
      root.style.setProperty("--cloudpainter-text-scale", scale);
    });
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      root.style.setProperty("--cloudpainter-text-scale", "1");
      root.querySelectorAll(selector).forEach(element => {
        element.removeAttribute("data-cloudpainter-text-scale");
        (element as HTMLElement | SVGElement).style.removeProperty("--cloudpainter-base-font-size");
      });
      root.style.removeProperty("--cloudpainter-text-scale");
    };
  }, [textSize]);
  return null;
}
