import React from 'react';
export function Card({ className='', ...props }) { return <div className={['rounded-2xl border bg-white dark:bg-zinc-900 card-shadow',className].join(' ')} {...props}/> }
export function CardHeader({ className='', ...props }) { return <div className={['p-5',className].join(' ')} {...props}/> }
export function CardContent({ className='', ...props }) { return <div className={['p-5 pt-0',className].join(' ')} {...props}/> }
export function CardTitle({ className='', ...props }) { return <h3 className={['text-lg font-semibold',className].join(' ')} {...props}/> }
export function CardDescription({ className='', ...props }) { return <p className={['text-sm text-gray-500 dark:text-gray-400',className].join(' ')} {...props}/> }
