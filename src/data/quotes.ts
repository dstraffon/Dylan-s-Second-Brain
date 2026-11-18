import { daysBetween, type DayKey } from '../lib/dates'

export interface Quote {
  text: string
  by?: string
}

/**
 * Hand-picked to be useful rather than cheerful: practical, a little dry,
 * nothing that tells you you're amazing. Edit freely.
 */
export const QUOTES: Quote[] = [
  { text: 'You do not rise to the level of your goals. You fall to the level of your systems.', by: 'James Clear' },
  { text: 'Every action you take is a vote for the type of person you wish to become.', by: 'James Clear' },
  { text: 'How we spend our days is, of course, how we spend our lives.', by: 'Annie Dillard' },
  { text: 'Waste no more time arguing about what a good man should be. Be one.', by: 'Marcus Aurelius' },
  { text: 'The impediment to action advances action. What stands in the way becomes the way.', by: 'Marcus Aurelius' },
  { text: 'It is not that we have a short time to live, but that we waste a lot of it.', by: 'Seneca' },
  { text: 'First say to yourself what you would be; and then do what you have to do.', by: 'Epictetus' },
  { text: 'Amateurs sit and wait for inspiration, the rest of us just get up and go to work.', by: 'Stephen King' },
  { text: 'The scariest moment is always just before you start.', by: 'Stephen King' },
  { text: 'Well done is better than well said.', by: 'Benjamin Franklin' },
  { text: 'Lost time is never found again.', by: 'Benjamin Franklin' },
  { text: 'Plans are worthless, but planning is everything.', by: 'Dwight D. Eisenhower' },
  { text: 'Perfect is the enemy of good.', by: 'Voltaire' },
  { text: 'Eighty percent of success is showing up.', by: 'Woody Allen' },
  { text: 'Begin anywhere.', by: 'John Cage' },
  { text: 'Make it work, make it right, make it fast.', by: 'Kent Beck' },
  { text: 'Do what you can, with what you have, where you are.', by: 'Theodore Roosevelt' },
  { text: 'He who has a why to live can bear almost any how.', by: 'Friedrich Nietzsche' },
  {
    text: 'Be regular and orderly in your life, so that you may be violent and original in your work.',
    by: 'Gustave Flaubert',
  },
  { text: 'What you do every day matters more than what you do once in a while.', by: 'Gretchen Rubin' },
  { text: 'Small deeds done are better than great deeds planned.', by: 'Peter Marshall' },
  { text: 'Slow is smooth, and smooth is fast.', by: 'Military saying' },
  { text: 'The best time to plant a tree was twenty years ago. The second best time is now.', by: 'Proverb' },
  { text: 'Pick the one thing that would make today a good day. Start there.' },
  { text: 'You don’t need a perfect plan, just the next step.' },
  { text: 'A boring day of steady work beats a heroic day you can’t repeat.' },
  { text: 'If it takes less than two minutes, do it now.' },
  { text: 'Missing once is an accident. Missing twice is the start of a new habit.' },
  { text: 'Finish one thing before you open three more tabs.' },
  { text: 'Rest is part of the work, not a reward for finishing it.' },
  { text: 'Write it down so your head can do the thinking instead of the remembering.' },
  { text: 'Progress you can see is easier to keep going than progress you have to imagine.' },
  { text: 'Do the hard thing while you still have the energy you’ll spend avoiding it.' },
  { text: 'Yesterday’s list doesn’t have to be today’s list. Cut what no longer matters.' },
]

/** Same quote all day, a different one tomorrow; `offset` lets you skip ahead. */
export function quoteFor(day: DayKey, offset = 0) {
  const n = daysBetween('2024-01-01', day) + offset
  return QUOTES[((n % QUOTES.length) + QUOTES.length) % QUOTES.length]
}
