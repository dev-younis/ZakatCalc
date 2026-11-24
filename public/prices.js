(async function(){
  try{
    const r=await fetch('/api/prices',{cache:'no-store'});
    if(!r.ok) throw new Error('exchange rates unavailable');
    const last=await r.json();
    if(!last.currencyRates || typeof last.currencyRates!=='object') throw new Error('invalid exchange rates');
    currencyRates=last.currencyRates;
    currencyRates.EGP=1;
    $('currencies').querySelectorAll('select').forEach(select=>currencyOptions(select,select.value));
    if(Number.isFinite(last.goldGramEgp) && last.goldGramEgp>0){
      liveGold=last.goldGramEgp;
      if(!goldEdited) applyGold();
    }
    const updated=last.fxUpdated?new Date(last.fxUpdated):null;
    const age=updated && !isNaN(updated)?Math.floor((Date.now()-updated.getTime())/864e5):null;
    const stale=$('stale');
    if(age===null || age>=1){
      stale.style.display='block';
      stale.textContent=age===null?'⚠️ وقت تحديث أسعار الصرف غير متوفر. تحقق منها قبل الحساب.':'⚠️ عمر أسعار الصرف '+fmt(age)+' يوم. تحقق منها قبل الحساب.';
    }else{
      stale.style.display='none';
    }
    $('live').textContent='أسعار الصرف: open.er-api.com'+(age!==null?' (آخر تحديث: '+updated.toLocaleString('en-US')+')':'')+(liveGold?'، وسعر الذهب العالمي: gold-api.com.':'؛ تعذر تحديث سعر الذهب، تحقق منه يدويًا.');
    calc();save();
  }catch(e){
    $('live').textContent='⚠️ تعذر تحديث أسعار الصرف. تحقق من اتصالك وأعد تحميل الصفحة.';
    calc();
  }
})();
