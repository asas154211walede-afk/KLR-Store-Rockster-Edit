const SERVICES = [
 {id:'simple',name:'فيديو بسيط',desc:'لقطات أنيقة ومونتاج خفيف.',price:1},
 {id:'medium',name:'فيديو متوسط',desc:'إيقاع بصري وانتقالات أكثر تفصيلاً.',price:1.5},
 {id:'pro',name:'فيديو احترافي',desc:'تجربة سينمائية متكاملة.',price:2},
 {id:'server-ad',name:'إعلان سيرفر',desc:'إبراز هوية السيرفر ومميزاته.',price:3},
 {id:'cinematic-ad',name:'إعلان سينمائي',desc:'إعلان بطابع سينمائي مميز.',price:4}
];
const STATUSES = ['جديد','بانتظار التحويل','بانتظار مراجعة الدفع','تم تأكيد الدفع','قيد التنفيذ','مكتمل','مرفوض'];
module.exports = {SERVICES, STATUSES};
