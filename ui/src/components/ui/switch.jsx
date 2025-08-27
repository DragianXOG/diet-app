import React from 'react';
export function Switch({ checked=false, onCheckedChange=()=>{}, className='' }) {
  return (
    <button
      type="button"
      aria-pressed={checked}
      onClick={()=>onCheckedChange(!checked)}
      className={[
        'relative inline-flex h-6 w-10 items-center rounded-full transition',
        checked ? 'bg-black' : 'bg-gray-300',
        className
      ].join(' ')}
    >
      <span className={[ 'inline-block h-5 w-5 transform rounded-full bg-white transition', checked ? 'translate-x-5' : 'translate-x-1' ].join(' ')} />
    </button>
  );
}
