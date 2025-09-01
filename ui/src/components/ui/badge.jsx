import React from 'react';
export function Badge({ variant='default', className='', children }) {
  const styles = {
    default:'bg-[#4B0082] text-white',
    secondary:'bg-[#4CBB17] text-black',
    destructive:'bg-red-600 text-white',
    outline:'border border-[#4B0082] text-[#4B0082]'
  };
  return <span className={['inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',styles[variant]||styles.default,className].join(' ')}>{children}</span>;
}
