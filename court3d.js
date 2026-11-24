/* PickleConnect 3D court with a kitchen-to-kitchen dink rally (three.js r128).
   PCCourt(canvas, {cam:function(w,h,cam){...}}) returns false if WebGL isn't available. */
window.PCCourt=function(canvas,opt){
  if(!window.THREE)return false;
  opt=opt||{};
  var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
  var renderer;
  try{renderer=new THREE.WebGLRenderer({canvas:canvas,antialias:true,alpha:true});}catch(e){return false;}
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  var scene=new THREE.Scene();
  var cam=new THREE.PerspectiveCamera(38,1,0.1,200);
  var C={court:0x2F6FB3,apron:0x2E8B62,line:0xF4F7FA,ball:0xE3EF3C};
  var apron=new THREE.Mesh(new THREE.PlaneGeometry(34,62),new THREE.MeshLambertMaterial({color:C.apron}));
  apron.rotation.x=-Math.PI/2;scene.add(apron);
  var surf=new THREE.Mesh(new THREE.PlaneGeometry(20,44),new THREE.MeshLambertMaterial({color:C.court}));
  surf.rotation.x=-Math.PI/2;surf.position.y=0.01;scene.add(surf);
  var lineMat=new THREE.MeshBasicMaterial({color:C.line});
  var lines=[];
  function line(w,d,x,z,delay){
    var m=new THREE.Mesh(new THREE.BoxGeometry(w,0.02,d),lineMat);
    m.position.set(x,0.03,z);m.userData={delay:delay,full:w>d?'x':'z'};scene.add(m);lines.push(m);
  }
  var T=0.17;
  line(20+T,T,0,-22,0);line(20+T,T,0,22,0.05);
  line(T,44,-10,0,0.1);line(T,44,10,0,0.15);
  line(20,T,0,-7,0.35);line(20,T,0,7,0.4);
  line(T,15,0,-14.5,0.55);line(T,15,0,14.5,0.6);
  var tape=new THREE.Mesh(new THREE.BoxGeometry(22,0.16,0.1),lineMat);tape.position.set(0,3.05,0);scene.add(tape);
  var meshNet=new THREE.Mesh(new THREE.BoxGeometry(22,2.9,0.03),new THREE.MeshLambertMaterial({color:0x0b1a2b,transparent:true,opacity:.55}));
  meshNet.position.set(0,1.55,0);scene.add(meshNet);
  [-11,11].forEach(function(x){var p=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,3.2,12),new THREE.MeshLambertMaterial({color:0x1c2b3b}));p.position.set(x,1.6,0);scene.add(p);});
  var tc=document.createElement('canvas');tc.width=512;tc.height=256;var g=tc.getContext('2d');
  g.fillStyle='#E3EF3C';g.fillRect(0,0,512,256);g.fillStyle='#B9C424';
  for(var r=0;r<5;r++){var y=30+r*49,n=[4,7,8,7,4][r];for(var k=0;k<n;k++){var x=(k+0.5+(r%2)*0.5)*512/n;g.beginPath();g.ellipse(x%512,y,12,9,0,0,Math.PI*2);g.fill();}}
  var ball=new THREE.Mesh(new THREE.SphereGeometry(0.55,40,28),new THREE.MeshLambertMaterial({map:new THREE.CanvasTexture(tc)}));
  scene.add(ball);
  var shadow=new THREE.Mesh(new THREE.CircleGeometry(0.6,32),new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:.28}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=0.04;scene.add(shadow);
  scene.add(new THREE.HemisphereLight(0xffffff,0x334455,0.55));
  var sun=new THREE.DirectionalLight(0xfff4dd,0.45);sun.position.set(-10,20,8);scene.add(sun);
  function size(){
    var w=canvas.clientWidth,h=canvas.clientHeight;if(!w||!h)return;
    renderer.setSize(w,h,false);cam.aspect=w/h;
    if(opt.cam)opt.cam(w,h,cam);else{cam.fov=30;cam.position.set(-40,30,40);cam.lookAt(-15,6,4);}
    cam.updateProjectionMatrix();
  }
  size();addEventListener('resize',size);
  var shots=[[-4,5.2,3.5,-5.0],[3.5,-5.0,-2.5,4.6],[-2.5,4.6,4.5,-5.6],[4.5,-5.6,-4,5.2]];
  var DUR=1.25,t0=performance.now();
  function lerp(a,b,t){return a+(b-a)*t;}
  function frame(now){
    var t=(now-t0)/1000;
    lines.forEach(function(m){var k=Math.min(1,Math.max(0,(t-m.userData.delay)/0.9));k=1-Math.pow(1-k,3);
      if(m.userData.full==='x')m.scale.x=Math.max(k,0.001);else m.scale.z=Math.max(k,0.001);});
    var rally=Math.max(0,t-1.3),i=Math.floor(rally/DUR)%shots.length,f=(rally%DUR)/DUR,s=shots[i];
    var x=lerp(s[0],s[2],f),z=lerp(s[1],s[3],f),y=0.55+Math.sin(Math.PI*f)*4.4;
    if(t<1.3){var d=Math.min(1,t/1.3);x=s[0];z=s[1];y=0.55+(1-d*d)*14;}
    ball.position.set(x,y,z);ball.rotation.x+=0.09;ball.rotation.z+=0.03;
    shadow.position.set(x,0.04,z);var sc=1-(y-0.55)/16;shadow.scale.set(sc,sc,sc);shadow.material.opacity=.3*sc;
    renderer.render(scene,cam);
    if(!reduce&&!document.hidden)requestAnimationFrame(frame);
  }
  if(reduce){t0=performance.now()-3000;frame(performance.now());}
  else{requestAnimationFrame(frame);document.addEventListener('visibilitychange',function(){if(!document.hidden)requestAnimationFrame(frame);});}
  return true;
};
