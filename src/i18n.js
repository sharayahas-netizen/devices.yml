'use strict';

// Survey question definitions and UI strings in Arabic and English.
const SECTIONS = [
  {
    key: 'room',
    title: { ar: 'الغرفة', en: 'The Room' },
    icon: '🛏️',
    questions: [
      { key: 'room_clean', ar: 'نظافة الغرفة', en: 'Room cleanliness' },
      { key: 'room_bed', ar: 'راحة السرير والفرش', en: 'Bed and bedding comfort' },
      { key: 'room_bath', ar: 'نظافة الحمام والمستلزمات', en: 'Bathroom cleanliness and amenities' },
      { key: 'room_ac', ar: 'التكييف والإضاءة', en: 'Air conditioning and lighting' },
      { key: 'room_quiet', ar: 'هدوء الغرفة', en: 'Room quietness' },
    ],
  },
  {
    key: 'hotel',
    title: { ar: 'الفندق', en: 'The Hotel' },
    icon: '🏨',
    questions: [
      { key: 'hotel_checkin', ar: 'سرعة وسهولة تسجيل الدخول والخروج', en: 'Check-in / check-out speed and ease' },
      { key: 'hotel_reception', ar: 'تعامل موظفي الاستقبال', en: 'Reception staff friendliness' },
      { key: 'hotel_facilities', ar: 'نظافة المرافق العامة (الممرات، المصعد، البهو)', en: 'Cleanliness of public areas (corridors, elevator, lobby)' },
      { key: 'hotel_speed', ar: 'سرعة الاستجابة للطلبات', en: 'Responsiveness to requests' },
    ],
  },
  {
    key: 'restaurant',
    title: { ar: 'المطعم', en: 'The Restaurant' },
    icon: '🍽️',
    questions: [
      { key: 'rest_food', ar: 'جودة الطعام وتنوعه', en: 'Food quality and variety' },
      { key: 'rest_breakfast', ar: 'جودة بوفيه الإفطار', en: 'Breakfast buffet quality' },
      { key: 'rest_clean', ar: 'نظافة المطعم', en: 'Restaurant cleanliness' },
      { key: 'rest_staff', ar: 'تعامل موظفي الخدمة', en: 'Service staff friendliness' },
      { key: 'rest_speed', ar: 'سرعة تقديم الطلبات', en: 'Speed of service' },
    ],
  },
];

const UI = {
  ar: {
    dir: 'rtl',
    langName: 'العربية',
    switchLang: 'English',
    welcomeTitle: 'يسعدنا معرفة رأيكم',
    welcomeText: 'شكراً لإقامتكم معنا. الاستبيان يستغرق دقيقتين فقط، وإجاباتكم تساعدنا على تحسين خدماتنا. الاستبيان مجهول الهوية.',
    roomLabel: 'غرفة رقم',
    finalTitle: 'التقييم الختامي',
    overall: 'التقييم العام للتجربة',
    recommend: 'هل تنصح أصدقاءك بالإقامة عندنا؟',
    recommendYes: 'نعم',
    recommendMaybe: 'ربما',
    recommendNo: 'لا',
    comments: 'ملاحظات واقتراحات (اختياري)',
    commentsPlaceholder: 'اكتب ملاحظاتك هنا...',
    contact: 'رقم جوال أو بريد للتواصل (اختياري)',
    submit: 'إرسال التقييم',
    requiredNote: 'جميع التقييمات بالنجوم مطلوبة',
    missingAnswers: 'فضلاً قيّم جميع البنود قبل الإرسال',
    thanksTitle: 'شكراً جزيلاً!',
    thanksText: 'تم استلام تقييمكم بنجاح. نتمنى لكم إقامة سعيدة.',
    closedTitle: 'تم تسجيل رأيكم مسبقاً',
    closedText: 'شكراً لكم، تم تعبئة استبيان هذه الغرفة مسبقاً. نتمنى لكم إقامة سعيدة.',
    invalidTitle: 'رابط غير صالح',
    invalidText: 'عذراً، هذا الرابط غير صحيح. فضلاً امسح رمز QR الموجود في الغرفة مرة أخرى.',
    stars: ['سيئ جداً', 'سيئ', 'مقبول', 'جيد', 'ممتاز'],
  },
  en: {
    dir: 'ltr',
    langName: 'English',
    switchLang: 'العربية',
    welcomeTitle: 'We value your feedback',
    welcomeText: 'Thank you for staying with us. This survey takes only two minutes and helps us improve. Your answers are anonymous.',
    roomLabel: 'Room',
    finalTitle: 'Final Rating',
    overall: 'Overall experience',
    recommend: 'Would you recommend us to your friends?',
    recommendYes: 'Yes',
    recommendMaybe: 'Maybe',
    recommendNo: 'No',
    comments: 'Comments and suggestions (optional)',
    commentsPlaceholder: 'Write your comments here...',
    contact: 'Phone or email for follow-up (optional)',
    submit: 'Submit',
    requiredNote: 'All star ratings are required',
    missingAnswers: 'Please rate all items before submitting',
    thanksTitle: 'Thank you!',
    thanksText: 'Your feedback has been received. Enjoy your stay.',
    closedTitle: 'Already submitted',
    closedText: 'Thank you — the survey for this room has already been completed. Enjoy your stay.',
    invalidTitle: 'Invalid link',
    invalidText: 'Sorry, this link is not valid. Please scan the QR code in your room again.',
    stars: ['Very poor', 'Poor', 'Fair', 'Good', 'Excellent'],
  },
};

// Flat lookup used by the admin dashboard (Arabic labels).
const QUESTION_LABELS_AR = {};
for (const s of SECTIONS) for (const q of s.questions) QUESTION_LABELS_AR[q.key] = q.ar;
QUESTION_LABELS_AR.overall = 'التقييم العام';

module.exports = { SECTIONS, UI, QUESTION_LABELS_AR };
