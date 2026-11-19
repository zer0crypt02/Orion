/* dom.js — tek sorumluluk: sorgu + element kurma */

export const $ = (sel, root = document) => root.querySelector(sel);

export function el(html){
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

export function scrollEnd(node){
  node.scrollTop = node.scrollHeight;
}
