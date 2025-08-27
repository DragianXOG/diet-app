import React from 'react';
export function Badge({ variant='default', className='', children }) {
  const styles = {
    default: 'bg-primary text-white',
    secondary: 'bg-accent text-black',
    destructive: 'bg-red-600 text-white',
    outline: 'border border-primary text-primary'
  };
  return <span className={['inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',styles[variant]||styles.default,className].join(' ')}>{children}</span>;
}
