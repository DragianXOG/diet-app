import React from 'react';
export const Textarea = React.forwardRef(({ className='', ...props }, ref) => (
  <textarea ref={ref} className={['w-full rounded-xl border px-3 py-2 text-sm bg-white dark:bg-zinc-900 focus:ring-2 focus:ring-[#4B0082]/60',className].join(' ')} {...props}/>
));
