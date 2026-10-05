// Fictional timetable fixtures. These are not UBC's published schedule or current seats.
const m=(days,start,end,location='Example classroom')=>({days,start,end,location});
const section=(id,label,component,meetings,options={})=>({id,label,component,status:'open',instructor:'Instructor not confirmed',enrolled:120,capacity:150,waitlisted:0,waitlistCapacity:20,reservationNote:null,sourceObservedAt:null,meetings,...options});
const course=(subject,code,title,credits,requiredComponents,sections)=>({campus:'UBCV',subject,code,title,credits,requiredComponents,sections});
export const demoFeed={campus:'UBCV',source:{name:'Fictional planning examples',url:null},terms:[{id:'example-w1',label:'Winter Term 1 · example',courses:[
  course('CPSC','110','Computation, Programs, and Programming',4,['Lecture','Lab'],[
    section('cpsc110-101','101','Lecture',[m([0,2,4],600,650,'Example: DMP')],{compatibleWith:['cpsc110-l1a','cpsc110-l1b']}),
    section('cpsc110-102','102','Lecture',[m([0,2,4],780,830,'Example: DMP')],{compatibleWith:['cpsc110-l2a']}),
    section('cpsc110-l1a','L1A','Lab',[m([1],840,950,'Example: ICCS')]),
    section('cpsc110-l1b','L1B','Lab',[m([3],840,950,'Example: ICCS')],{status:'waitlist',enrolled:30,capacity:30,waitlisted:8,waitlistCapacity:15}),
    section('cpsc110-l2a','L2A','Lab',[m([1],600,710,'Example: ICCS')])]),
  course('MATH','100','Differential Calculus with Applications',3,['Lecture'],[
    section('math100-101','101','Lecture',[m([0,2,4],540,590,'Example: Mathematics')]),
    section('math100-102','102','Lecture',[m([1,3],660,740,'Example: Mathematics')],{reservationNote:'Some capacity reserved for specific programs.'}),
    section('math100-103','103','Lecture',[m([0,2,4],780,830,'Example: Mathematics')],{status:'closed',enrolled:150,capacity:150,waitlistCapacity:0})]),
  course('DSCI','100','Introduction to Data Science',3,['Lecture','Tutorial'],[
    section('dsci100-101','101','Lecture',[m([1,3],540,620,'Example: ESB')],{compatibleWith:['dsci100-t1a','dsci100-t1b']}),
    section('dsci100-102','102','Lecture',[m([1,3],780,860,'Example: ESB')],{compatibleWith:['dsci100-t2a']}),
    section('dsci100-t1a','T1A','Tutorial',[m([4],660,710,'Example: ESB')]),
    section('dsci100-t1b','T1B','Tutorial',[m([2],900,950,'Example: ESB')]),
    section('dsci100-t2a','T2A','Tutorial',[m([4],900,950,'Example: ESB')])]),
  course('CHEM','121','Structure and Bonding in Chemistry',4,['Lecture','Lab'],[
    section('chem121-101','101','Lecture',[m([0,2,4],600,650,'Example: Chemistry')],{reservationNote:'Check program restrictions in Workday.'}),
    section('chem121-102','102','Lecture',[m([0,2,4],840,890,'Example: Chemistry')]),
    section('chem121-l1a','L1A','Lab',[m([3],900,1070,'Example: Chemistry')]),
    section('chem121-l1b','L1B','Lab',[m([1],900,1070,'Example: Chemistry')])]),
  course('ENGL','110','Approaches to Literature',3,['Lecture'],[
    section('engl110-101','101','Lecture',[m([1,3],630,710,'Example: Buchanan')]),
    section('engl110-102','102','Lecture',[m([0,2,4],720,770,'Example: Buchanan')])]),
  course('CPSC','210','Software Construction',4,['Lecture','Lab'],[
    section('cpsc210-201','201','Lecture',[m([1,3],720,800,'Example: DMP')]),
    section('cpsc210-l2a','L2A','Lab',[m([4],840,950,'Example: ICCS')])]),
  course('DEMO','199A','Course without historical grade data',3,['Lecture'],[
    section('demo199a-101','101','Lecture',[m([2],1080,1190)],{status:'cancelled',enrolled:null,capacity:null,waitlisted:null,waitlistCapacity:null})])
]},{id:'example-w2',label:'Winter Term 2 · example',courses:[
  course('MATH','101','Integral Calculus with Applications',3,['Lecture'],[
    section('math101-201','201','Lecture',[m([0,2,4],600,650)]),
    section('math101-202','202','Lecture',[m([1,3],840,920)])]),
  course('CPSC','210','Software Construction',4,['Lecture','Lab'],[
    section('cpsc210-202','202','Lecture',[m([0,2,4],660,710)]),
    section('cpsc210-l2b','L2B','Lab',[m([1],900,1010)])])
]}]};
