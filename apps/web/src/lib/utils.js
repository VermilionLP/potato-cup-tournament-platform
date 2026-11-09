import { clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge has to know the site's own font-size steps (app.css),
// otherwise it takes `text-small` for a colour and drops it next to a
// `text-<colour>` class.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'title', 'heading', 'body', 'small', 'label'],
    },
  },
});

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
