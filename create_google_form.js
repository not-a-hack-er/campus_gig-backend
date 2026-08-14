/**
 * CampusGig — Instant Google Form Generator Script
 * 
 * HOW TO USE THIS IN 30 SECONDS:
 * 1. Open your browser and go to: https://script.new (Opens Google Apps Script)
 * 2. Delete any default code and paste this ENTIRE script.
 * 3. Click the "Run" button at the top (play icon ▶).
 * 4. Grant permission if Google asks.
 * 5. Check the Execution Log at the bottom — your Google Form link will be created instantly!
 */

function createCampusGigForm() {
  // Create Google Form
  var form = FormApp.create('CampusGig ⚡ Early Access & Beta Waitlist');
  
  form.setDescription(
    'CampusGig is the peer-to-peer campus marketplace designed for students to showcase skills, find paid gigs, and hire verified campus peers.\n\n' +
    'Fill out this 60-second form to secure priority Beta access, unlock a Founding Member badge on your profile, and help shape features before public launch!'
  );
  
  form.setCollectEmail(true);

  // ── SECTION 1: Student Identity ─────────────────────────────────────
  form.addSectionHeaderItem().setTitle('01. Student Profile');
  
  form.addTextItem()
    .setTitle('Full Name')
    .setRequired(true);
    
  form.addTextItem()
    .setTitle('College / University Name')
    .setHelpText('e.g., IIT Bombay, SRM Institute, DTU, VIT Vellore')
    .setRequired(true);
    
  form.addTextItem()
    .setTitle('Branch / Major & Graduation Year')
    .setHelpText('e.g., CSE 2026, Mechanical 2025, Design 2027')
    .setRequired(true);
    
  form.addTextItem()
    .setTitle('LinkedIn or GitHub Profile URL (Optional)')
    .setHelpText('Speeds up your profile verification badge approval.');

  // ── SECTION 2: Primary Role & Intent ────────────────────────────────
  form.addPageBreakItem().setTitle('02. Your Intent');
  
  var intentItem = form.addMultipleChoiceItem();
  intentItem.setTitle('How do you plan to primarily use CampusGig?')
    .setRequired(true)
    .setChoices([
      intentItem.createChoice('💼 I want to offer skills & earn money (Apply for gigs)'),
      intentItem.createChoice('🚀 I need tasks done & want to hire peers (Post gigs)'),
      intentItem.createChoice('⚡ Both (Offer skills AND hire peers when needed)')
    ]);

  // ── SECTION 3: Skills & Categories ──────────────────────────────────
  form.addPageBreakItem().setTitle('03. Skills & Needs Discovery');
  
  var skillsItem = form.addCheckboxItem();
  skillsItem.setTitle('What are your primary areas of skill or interest?')
    .setHelpText('Select all that apply')
    .setChoices([
      skillsItem.createChoice('💻 Coding & Software Development (Full-stack, Android, Web, Scripts)'),
      skillsItem.createChoice('🎨 UI/UX & Graphic Design (Figma, Posters, Logos, Branding)'),
      skillsItem.createChoice('✍️ Content & Copywriting (Technical writing, Blogs, Resumes, SOPs)'),
      skillsItem.createChoice('📚 Tutoring & Academics (Coursework, Exam prep, Math, Science)'),
      skillsItem.createChoice('📸 Photography & Event Coverage (Campus events, Headshots)'),
      skillsItem.createChoice('📹 Video Editing & Content Creation (Reels, YouTube, Short films)'),
      skillsItem.createChoice('📣 Campus Marketing & Growth (Social media, Event promotion)')
    ]);

  form.addParagraphTextItem()
    .setTitle('What is the biggest challenge you face when trying to find freelance work or hire peers on campus today?')
    .setHelpText('Your feedback directly influences what we build first!');

  // ── SECTION 4: Private Beta Signup ──────────────────────────────────
  form.addPageBreakItem().setTitle('04. Early Access & Beta');
  
  var betaItem = form.addMultipleChoiceItem();
  betaItem.setTitle('Would you like to participate in private Android Beta testing starting in 7 days?')
    .setRequired(true)
    .setChoices([
      betaItem.createChoice('Yes! Sign me up for private Android Beta testing.'),
      betaItem.createChoice('No, just notify me on public launch day.')
    ]);

  // Output Links in Logger
  Logger.log('\n==================================================');
  Logger.log('✅ GOOGLE FORM CREATED SUCCESSFULLY!');
  Logger.log('==================================================');
  Logger.log('🔗 Form Link to share on LinkedIn / Bio:\n' + form.getPublishedUrl());
  Logger.log('✏️ Edit Form Link:\n' + form.getEditUrl());
  Logger.log('==================================================\n');
}
