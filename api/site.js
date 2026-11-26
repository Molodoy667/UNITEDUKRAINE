import {createSiteHandler} from '../lib/site/public.js';
import {createDonationHandler} from '../lib/donation/service.js';

const site=createSiteHandler(),donation=createDonationHandler();
export default function handler(request,response){
 const params=new URL(request.url||'/', 'http://united.local').searchParams;
 return params.get('scope')==='donation'?donation(request,response):site(request,response);
}
