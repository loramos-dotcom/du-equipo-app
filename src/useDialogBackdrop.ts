import {useRef} from 'react';
import type {MouseEvent,PointerEvent} from 'react';
function outside(event:MouseEvent<HTMLDialogElement>|PointerEvent<HTMLDialogElement>){
 const bounds=event.currentTarget.getBoundingClientRect();
 return event.clientX<bounds.left||event.clientX>bounds.right||event.clientY<bounds.top||event.clientY>bounds.bottom;
}
export function useDialogBackdrop(onClose:()=>void,enabled=true){
 const pressedOutside=useRef(false);
 return {
  onPointerDown:(event:PointerEvent<HTMLDialogElement>)=>{pressedOutside.current=enabled&&event.target===event.currentTarget&&outside(event);},
  onPointerCancel:()=>{pressedOutside.current=false;},
  onClick:(event:MouseEvent<HTMLDialogElement>)=>{const close=enabled&&pressedOutside.current&&event.target===event.currentTarget&&outside(event);pressedOutside.current=false;if(close)onClose();},
 };
}
