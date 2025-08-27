import React from 'react';
export function Button({ variant='default', size='default', className='', ...props }) {
  const base = 'inline-flex items-center justify-center rounded-2xl border font-medium transition active:scale-[.99] focus:outline-none focus:ring-2 focus:ring-primary/50';
  const paddings = { sm:'px-2.5 py-1.5 text-xs', default:'px-3.5 py-2.5 text-sm' };
  const variants = {
    default:   'bg-primary text-white border-primary hover:opacity-90',
    secondary: 'bg-accent text-black border-accent hover:brightness-95',
    outline:   'bg-transparent text-primary border-primary hover:bg-primary/10',
    ghost:     'bg-transparent text-primary border-transparent hover:bg-primary/10'
  };
  return <button className={[base,paddings[size]||paddings.default,variants[variant]||variants.default,className].join(' ')} {...props} />;
}
export default Button;
