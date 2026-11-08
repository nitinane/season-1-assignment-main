import { supabase } from '../lib/supabase';
import { getCurrentUser } from '../lib/supabase';

export async function seedDemoData() {
  const currentUser = await getCurrentUser();
  if (!currentUser) throw new Error('No user logged in');

  // 1. Insert a demo job role
  const { data: job, error: jobErr } = await supabase
    .from('job_roles')
    .insert({
      hr_user_id: currentUser.id,
      title: 'Senior Full Stack Engineer (React & Node.js)',
      description: 'We are looking for a Senior Full Stack Engineer to lead our frontend and backend developer teams. You will own client-facing features built on React, TailwindCSS, and Node.js microservices.',
      experience_level: '4–7 years (Senior)',
      required_skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'TailwindCSS'],
      preferred_tools: ['Docker', 'AWS', 'GitHub Actions'],
      status: 'active',
    })
    .select()
    .single();

  if (jobErr || !job) {
    throw new Error(`Failed to create demo job role: ${jobErr?.message || 'Unknown error'}`);
  }

  // 2. Insert demo applications
  const demoApps = [
    {
      hr_user_id: currentUser.id,
      job_id: job.id,
      candidate_name: 'Elena Morales',
      candidate_email: 'elena.morales@example.com',
      resume_text: `Elena Morales\nSenior Full Stack Engineer (6+ Years Experience)\nEmail: elena.morales@example.com\n\nPROFESSIONAL SUMMARY\nExperienced Full Stack Developer with 6 years of expertise building scalable web applications. Strong track record of leading small engineering teams and designing modular, clean code. Highly skilled in React, Node.js, TypeScript, and database optimization.\n\nTECHNICAL SKILLS\n- Frontend: React, Redux, HTML5, CSS3, TailwindCSS\n- Backend: Node.js, Express, TypeScript, REST APIs\n- Database: PostgreSQL, Redis, MongoDB\n- DevOps: Docker, AWS (S3, EC2), GitHub Actions\n\nEXPERIENCE\n- Senior Developer at FinTech Corp (2022 - Present)\n  * Led a team of 3 developers to rebuild the core dashboard in React & TypeScript.\n  * Optimized SQL queries, reducing API response latency by 40%.\n- Software Engineer at SaaS Labs (2019 - 2022)\n  * Developed microservices in Node.js and integrated third-party payment gateways.\n  * Maintained CI/CD pipelines via GitHub Actions.`,
      score: 94,
      score_reasoning: JSON.stringify({
        score: 94,
        reason: 'Elena is an outstanding match with 6 years of full stack experience. She has strong, documented expertise in React, Node.js, TypeScript, and PostgreSQL. She also has experience leading small developer teams and optimizing SQL queries.',
        advantage_notes: 'Has team leadership experience and verified database query optimization achievements.',
        matched_skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'TailwindCSS'],
        missing_skills: []
      }),
      status: 'shortlisted'
    },
    {
      hr_user_id: currentUser.id,
      job_id: job.id,
      candidate_name: 'James Duncan',
      candidate_email: 'james.duncan@example.com',
      resume_text: `James Duncan\nFrontend developer (2 Years Experience)\nEmail: james.duncan@example.com\n\nSUMMARY\nMid-level frontend developer with a passion for designing pixel-perfect user interfaces. Proficient in React, responsive styling, and modern design systems. Looking to expand backend skill set.\n\nSKILLS\n- React, HTML, TailwindCSS, CSS Grid, Javascript\n- Basic Node.js, Git\n\nEXPERIENCE\n- Frontend Dev at WebDesign Studio (2023 - Present)\n  * Built landing pages and interactive dashboards using React and TailwindCSS.`,
      score: 68,
      score_reasoning: JSON.stringify({
        score: 68,
        reason: 'James has good frontend skills using React and TailwindCSS. However, he only has 2 years of experience and lacks backend Node.js and PostgreSQL database knowledge.',
        advantage_notes: 'Highly skilled in responsive visual styling and modern design systems.',
        matched_skills: ['React', 'TailwindCSS'],
        missing_skills: ['Node.js', 'TypeScript', 'PostgreSQL']
      }),
      status: 'scored'
    },
    {
      hr_user_id: currentUser.id,
      job_id: job.id,
      candidate_name: 'Marcus Chen',
      candidate_email: 'marcus.chen@example.com',
      resume_text: `Marcus Chen\nDevOps & Cloud Engineer\nEmail: marcus.chen@example.com\n\nSUMMARY\nSpecialist in infrastructure automation, cloud scaling, and containerization. 5 years of experience configuring cloud environments on AWS and automating deployments via CI/CD pipelines.\n\nSKILLS\n- AWS, Docker, Kubernetes, Terraform\n- Python scripting, Bash, GitHub Actions\n\nEXPERIENCE\n- DevOps Engineer at CloudWorks (2021 - Present)\n  * Automated EC2 deployments and scaled database replication.`,
      score: 45,
      score_reasoning: JSON.stringify({
        score: 45,
        reason: 'Marcus is primarily a DevOps engineer. Although he has excellent cloud scaling and containerization skills (Docker, AWS), he lacks application development experience in React or Node.js.',
        advantage_notes: 'Strong infrastructure and deployment automation background.',
        matched_skills: [],
        missing_skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'TailwindCSS']
      }),
      status: 'ingested'
    },
    {
      hr_user_id: currentUser.id,
      job_id: job.id,
      candidate_name: 'Sophia Lin',
      candidate_email: 'sophia.lin@example.com',
      resume_text: `Sophia Lin\nDigital Marketing Specialist\nEmail: sophia.lin@example.com\n\nSUMMARY\nDigital marketing leader with 4 years of experience driving SEO, SEM, content strategy, and paid social campaigns. Expert in analytical tracking and customer acquisition.\n\nSKILLS\n- Google Analytics, HubSpot, SEMrush, Social Media Marketing`,
      score: 12,
      score_reasoning: JSON.stringify({
        score: 12,
        reason: 'Sophia is a digital marketing specialist. None of her skills or professional background match the technical requirements of a Senior Full Stack Developer role.',
        advantage_notes: 'None',
        matched_skills: [],
        missing_skills: ['React', 'Node.js', 'TypeScript', 'PostgreSQL', 'TailwindCSS']
      }),
      status: 'ingested'
    }
  ];

  const { error: appErr } = await supabase.from('applications').insert(demoApps);
  if (appErr) {
    throw new Error(`Failed to insert demo applications: ${appErr.message}`);
  }

  // 3. For Elena Morales, let's also pre-generate some interview questions so she looks ready
  const { data: elenaApp } = await supabase
    .from('applications')
    .select('id')
    .eq('job_id', job.id)
    .eq('candidate_name', 'Elena Morales')
    .single();

  if (elenaApp) {
    const demoQuestions = [
      { category: 'System Architecture', question: 'How would you design a scalable microservices structure for Node.js, and how would you handle shared data access without database bottlenecks?', difficulty: 'Hard', skill: 'Node.js' },
      { category: 'React State Management', question: 'In React, what are the primary performance implications of using Context API compared to Redux, and how would you optimize render performance?', difficulty: 'Medium', skill: 'React' },
      { category: 'Database Optimization', question: 'Explain how indexing works in PostgreSQL and describe a scenario where adding an index could actually degrade query performance.', difficulty: 'Hard', skill: 'PostgreSQL' },
      { category: 'TypeScript Safety', question: 'What is the difference between type aliases and interfaces in TypeScript, and how would you enforce strict runtime verification?', difficulty: 'Medium', skill: 'TypeScript' }
    ];

    await supabase.from('interviews').insert({
      hr_user_id: currentUser.id,
      application_id: elenaApp.id,
      job_id: job.id,
      questions: demoQuestions,
      status: 'questions_ready'
    });
  }

  return { jobRoleId: job.id };
}
