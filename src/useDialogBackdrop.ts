import {useEffect,useRef} from 'react';
import type {RefObject} from 'react';

// Native modal backdrops are outside the dialog's DOM box. Listen in capture
// so selecting text or nested menus cannot swallow the outside press.
export function useDialogBackdrop(ref:RefObject<HTMLDialogElement|null>,onClose:()=>void,enabled=true){
 const close=useRef(onClose);close.current=onClose;
 useEffect(()=>{
  if(!enabled)return;
  const outside=(event:PointerEvent)=>{
   const dialog=ref.current;
   if(!dialog?.open||event.button!==0||Array.from(document.querySelectorAll('dialog[open]')).at(-1)!==dialog)return;
   const bounds=dialog.getBoundingClientRect();
   if(event.clientX>=bounds.left&&event.clientX<=bounds.right&&event.clientY>=bounds.top&&event.clientY<=bounds.bottom)return;
   event.preventDefault();event.stopPropagation();close.current();
  };
  document.addEventListener('pointerdown',outside,true);
  return ()=>document.removeEventListener('pointerdown',outside,true);
 },[ref,enabled]);
}
