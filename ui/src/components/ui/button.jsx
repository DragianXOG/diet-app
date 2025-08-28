import React from 'react';
export function Button({ variant='default', size='default', className='', ...props }) {
  const base='inline-flex items-center justify-center rounded-2xl border font-medium transition active:scale-[.99] focus:outline-none focus:ring-2 focus:ring-[#4B0082]/50';
  const paddings={ sm:'px-2.5 py-1.5 text-xs', default:'px-3.5 py-2.5 text-sm' };
  const variants={
    default:'bg-[#4B0082] text-white border-[#4B0082] hover:opacity-90',
    secondary:'bg-[#4CBB17] text-black border-[#4CBB17] hover:brightness-95',
    outline:'bg-transparent text-[#4B0082] border-[#4B0082] hover:bg-[#4B0082]/10',
    ghost:'bg-transparent text-[#4B0082] border-transparent hover:bg-[#4B0082]/10'
  };
  return <button className={[base,paddings[size]||paddings.default,variants[variant]||variants.default,className].join(' ')} {...props} />;
}
export default Button;
