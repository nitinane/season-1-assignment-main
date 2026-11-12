export interface Job {
  id: string;
  title: string;
  location: string;
  summary: string;
  questions: string[];
}

export const JOBS: Job[] = [
  {
    id: 'frontend-developer',
    title: 'Frontend Developer',
    location: 'Bengaluru, India (Hybrid)',
    summary:
      'Build responsive, high-performance web applications using React, TypeScript, and modern web APIs. Collaborate with product design and backend teams to ship delightful user experiences.',
    questions: [
      'Apne baare mein aur apne frontend development background ke baare mein batayiye.',
      'React ya TypeScript mein koi challenging bug ya performance issue aapne kaise diagnose aur solve kiya?',
      'Jab aapko tight deadline mein deliver karna hota hai, toh code quality aur speed ko kaise balance karte hain?',
    ],
  },
  {
    id: 'customer-support-executive',
    title: 'Customer Support Executive',
    location: 'Mumbai, India (On-site)',
    summary:
      'Provide empathetic, fast, and effective customer support across chat, email, and voice. Resolve customer inquiries and champion user satisfaction.',
    questions: [
      'Apne background aur customer support experience ke baare mein brief mein batayiye.',
      'Agar koi customer bohot frustrated ya angry ho, toh aap situation ko kaise calmly handle aur de-escalate karte hain?',
      'Koi aisa example share kijiye jab aapne out of the way jaakar customer ki problem solve ki thi.',
    ],
  },
  {
    id: 'sales-associate',
    title: 'Sales Associate',
    location: 'Delhi NCR, India (Remote)',
    summary:
      'Drive outbound outreach, qualify inbound leads, and present HireFlow AI solutions to HR leaders and hiring managers. Build lasting customer relationships.',
    questions: [
      'Apne sales background aur key achievements ya closed deals ke baare mein batayiye.',
      'Cold outreach ya naye prospects ke saath initial conversation start karne ki aapki approach kya hoti hai?',
      'Jab koi prospect pricing ya competitor ko lekar objection raise kare, toh aap use kaise navigate karte hain?',
    ],
  },
];

export function getJobById(id: string): Job | undefined {
  return JOBS.find((j) => j.id === id);
}

