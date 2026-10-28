(function () {
  'use strict';

  var section = document.querySelector('[data-ds-cinematic]');
  var sticky = section && section.querySelector('.ds-cinematic-sticky');
  var canvas = section && section.querySelector('[data-ds-webgl]');
  if (!section || !sticky || !canvas) return;

  var mobileMq = window.matchMedia('(max-width: 899px)');
  var reducedMq = window.matchMedia('(prefers-reduced-motion: reduce)');
  var coarseMq = window.matchMedia('(pointer: coarse)');
  if (mobileMq.matches || reducedMq.matches) return;

  var gl = canvas.getContext('webgl', {
    alpha: true,
    antialias: true,
    premultipliedAlpha: true,
    powerPreference: 'high-performance'
  });
  if (!gl) return;

  var VERT = [
    'attribute vec3 aPosition;',
    'attribute vec3 aNormal;',
    'uniform mat4 uProjection;',
    'uniform mat4 uView;',
    'uniform mat4 uModel;',
    'uniform mat3 uNormalMatrix;',
    'varying vec3 vNormal;',
    'varying vec3 vWorld;',
    'void main(){',
    '  vec4 world = uModel * vec4(aPosition, 1.0);',
    '  vWorld = world.xyz;',
    '  vNormal = normalize(uNormalMatrix * aNormal);',
    '  gl_Position = uProjection * uView * world;',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform vec3 uColor;',
    'uniform vec3 uEmissive;',
    'uniform float uMetal;',
    'uniform float uRough;',
    'uniform float uOpacity;',
    'uniform vec3 uCamera;',
    'uniform vec3 uKeyDir;',
    'uniform vec3 uFillDir;',
    'varying vec3 vNormal;',
    'varying vec3 vWorld;',
    'void main(){',
    '  vec3 n = normalize(vNormal);',
    '  vec3 v = normalize(uCamera - vWorld);',
    '  vec3 k = normalize(-uKeyDir);',
    '  vec3 f = normalize(-uFillDir);',
    '  float kd = max(dot(n,k),0.0);',
    '  float fd = max(dot(n,f),0.0);',
    '  vec3 h = normalize(k+v);',
    '  float specPower = mix(70.0, 18.0, uRough);',
    '  float spec = pow(max(dot(n,h),0.0), specPower) * mix(0.32, 1.15, uMetal);',
    '  float rim = pow(1.0-max(dot(n,v),0.0), 2.5);',
    '  vec3 base = uColor * (0.20 + kd*0.88 + fd*0.26);',
    '  vec3 coolRim = vec3(0.26,0.56,0.82) * rim * 0.18;',
    '  vec3 lit = base + vec3(spec) + coolRim + uEmissive;',
    '  gl_FragColor = vec4(lit, uOpacity);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }

  var program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
  gl.useProgram(program);

  var loc = {
    pos: gl.getAttribLocation(program, 'aPosition'),
    norm: gl.getAttribLocation(program, 'aNormal'),
    projection: gl.getUniformLocation(program, 'uProjection'),
    view: gl.getUniformLocation(program, 'uView'),
    model: gl.getUniformLocation(program, 'uModel'),
    normalMatrix: gl.getUniformLocation(program, 'uNormalMatrix'),
    color: gl.getUniformLocation(program, 'uColor'),
    emissive: gl.getUniformLocation(program, 'uEmissive'),
    metal: gl.getUniformLocation(program, 'uMetal'),
    rough: gl.getUniformLocation(program, 'uRough'),
    opacity: gl.getUniformLocation(program, 'uOpacity'),
    camera: gl.getUniformLocation(program, 'uCamera'),
    keyDir: gl.getUniformLocation(program, 'uKeyDir'),
    fillDir: gl.getUniformLocation(program, 'uFillDir')
  };

  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  function v3(x, y, z) { return [x, y, z]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function lerp(a, b, t) { return a + (b-a)*t; }
  function smoothstep(a, b, v) {
    var t = clamp((v-a)/(b-a || 1), 0, 1);
    return t*t*(3-2*t);
  }
  function pulse(v, a, b, c, d) { return smoothstep(a,b,v) * (1-smoothstep(c,d,v)); }

  function mat4Identity() { return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function mat4Mul(a,b) {
    var o = new Array(16);
    for (var c=0;c<4;c++) for (var r=0;r<4;r++) {
      o[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] + a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
    }
    return o;
  }
  function mat4Translate(x,y,z){ var m=mat4Identity(); m[12]=x;m[13]=y;m[14]=z;return m; }
  function mat4Scale(x,y,z){ var m=mat4Identity(); m[0]=x;m[5]=y;m[10]=z;return m; }
  function mat4RotX(a){ var c=Math.cos(a),s=Math.sin(a); return [1,0,0,0, 0,c,s,0, 0,-s,c,0, 0,0,0,1]; }
  function mat4RotY(a){ var c=Math.cos(a),s=Math.sin(a); return [c,0,-s,0, 0,1,0,0, s,0,c,0, 0,0,0,1]; }
  function mat4RotZ(a){ var c=Math.cos(a),s=Math.sin(a); return [c,s,0,0, -s,c,0,0, 0,0,1,0, 0,0,0,1]; }
  function compose(p,r,s){
    var m = mat4Translate(p[0],p[1],p[2]);
    m = mat4Mul(m, mat4RotZ(r[2]));
    m = mat4Mul(m, mat4RotY(r[1]));
    m = mat4Mul(m, mat4RotX(r[0]));
    return mat4Mul(m, mat4Scale(s[0],s[1],s[2]));
  }
  function perspective(fov, aspect, near, far) {
    var f=1/Math.tan(fov/2), nf=1/(near-far);
    return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,(2*far*near)*nf,0];
  }
  function norm(a){ var l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; }
  function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
  function sub(a,b){ return [a[0]-b[0],a[1]-b[1],a[2]-b[2]]; }
  function lookAt(eye,target,up){
    var z=norm(sub(eye,target)), x=norm(cross(up,z)), y=cross(z,x);
    return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
      -(x[0]*eye[0]+x[1]*eye[1]+x[2]*eye[2]),
      -(y[0]*eye[0]+y[1]*eye[1]+y[2]*eye[2]),
      -(z[0]*eye[0]+z[1]*eye[1]+z[2]*eye[2]),1];
  }
  function normalMatrixFrom4(m){
    var a00=m[0],a01=m[4],a02=m[8], a10=m[1],a11=m[5],a12=m[9], a20=m[2],a21=m[6],a22=m[10];
    var b01=a22*a11-a12*a21, b11=-a22*a10+a12*a20, b21=a21*a10-a11*a20;
    var det=a00*b01+a01*b11+a02*b21;
    if (!det) return [1,0,0,0,1,0,0,0,1];
    det=1/det;
    return [b01*det, (-a22*a01+a02*a21)*det, (a12*a01-a02*a11)*det,
            b11*det, (a22*a00-a02*a20)*det, (-a12*a00+a02*a10)*det,
            b21*det, (-a21*a00+a01*a20)*det, (a11*a00-a01*a10)*det];
  }

  function cubeGeo(){
    var p=[],n=[],idx=[];
    var faces=[
      [[-1,-1, 1],[ 1,-1, 1],[ 1, 1, 1],[-1, 1, 1],[0,0,1]],
      [[ 1,-1,-1],[-1,-1,-1],[-1, 1,-1],[ 1, 1,-1],[0,0,-1]],
      [[-1, 1, 1],[ 1, 1, 1],[ 1, 1,-1],[-1, 1,-1],[0,1,0]],
      [[-1,-1,-1],[ 1,-1,-1],[ 1,-1, 1],[-1,-1, 1],[0,-1,0]],
      [[ 1,-1, 1],[ 1,-1,-1],[ 1, 1,-1],[ 1, 1, 1],[1,0,0]],
      [[-1,-1,-1],[-1,-1, 1],[-1, 1, 1],[-1, 1,-1],[-1,0,0]]
    ];
    faces.forEach(function(f){ var base=p.length/3; for(var i=0;i<4;i++){p.push(f[i][0],f[i][1],f[i][2]);n.push(f[4][0],f[4][1],f[4][2]);} idx.push(base,base+1,base+2, base,base+2,base+3); });
    return {p:p,n:n,i:idx};
  }
  function sphereGeo(seg, rings){
    var p=[],n=[],idx=[];
    for(var y=0;y<=rings;y++){
      var v=y/rings, phi=v*Math.PI;
      for(var x=0;x<=seg;x++){
        var u=x/seg, th=u*Math.PI*2;
        var sx=Math.sin(phi)*Math.cos(th), sy=Math.cos(phi), sz=Math.sin(phi)*Math.sin(th);
        p.push(sx,sy,sz); n.push(sx,sy,sz);
      }
    }
    for(var yy=0;yy<rings;yy++) for(var xx=0;xx<seg;xx++){
      var a=yy*(seg+1)+xx,b=a+seg+1; idx.push(a,b,a+1,b,b+1,a+1);
    }
    return {p:p,n:n,i:idx};
  }
  function cylGeo(seg){
    var p=[],n=[],idx=[];
    for(var y=0;y<2;y++){
      var yy=y?1:-1;
      for(var i=0;i<=seg;i++){
        var a=i/seg*Math.PI*2,c=Math.cos(a),s=Math.sin(a); p.push(c,yy,s); n.push(c,0,s);
      }
    }
    for(var j=0;j<seg;j++){ var a0=j,a1=j+1,b0=(seg+1)+j,b1=b0+1; idx.push(a0,b0,a1,b0,b1,a1); }
    var top=p.length/3; p.push(0,1,0);n.push(0,1,0); var bot=p.length/3; p.push(0,-1,0);n.push(0,-1,0);
    var topStart=p.length/3;
    for(var k=0;k<=seg;k++){var aa=k/seg*Math.PI*2,cc=Math.cos(aa),ss=Math.sin(aa);p.push(cc,1,ss);n.push(0,1,0);} 
    var botStart=p.length/3;
    for(var q=0;q<=seg;q++){var ab=q/seg*Math.PI*2,cb=Math.cos(ab),sb=Math.sin(ab);p.push(cb,-1,sb);n.push(0,-1,0);} 
    for(var t=0;t<seg;t++){idx.push(top,topStart+t,topStart+t+1);idx.push(bot,botStart+t+1,botStart+t);} 
    return {p:p,n:n,i:idx};
  }

  function uploadGeo(g){
    var o={};
    o.pb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,o.pb); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.p),gl.STATIC_DRAW);
    o.nb=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,o.nb); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(g.n),gl.STATIC_DRAW);
    o.ib=gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,o.ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(g.i),gl.STATIC_DRAW);
    o.count=g.i.length; return o;
  }

  var GEO={cube:uploadGeo(cubeGeo()),sphere:uploadGeo(sphereGeo(20,14)),cyl:uploadGeo(cylGeo(20))};

  function hex(h){ h=h.replace('#',''); if(h.length===3)h=h.split('').map(function(x){return x+x;}).join(''); var v=parseInt(h,16); return [(v>>16&255)/255,(v>>8&255)/255,(v&255)/255]; }
  var MAT={
    graphite:{color:hex('#101826'),em:[0,0,0],metal:.72,rough:.26,opacity:1},
    graphite2:{color:hex('#192637'),em:[0,0,0],metal:.55,rough:.36,opacity:1},
    navy:{color:hex('#0d2943'),em:[.005,.016,.03],metal:.54,rough:.30,opacity:1},
    steel:{color:hex('#60758a'),em:[0,0,0],metal:.82,rough:.22,opacity:1},
    pale:{color:hex('#edf4f7'),em:[0,0,0],metal:.08,rough:.54,opacity:1},
    white:{color:hex('#ffffff'),em:[.008,.008,.008],metal:.04,rough:.46,opacity:1},
    blue:{color:hex('#4d9bd1'),em:[.02,.08,.14],metal:.20,rough:.26,opacity:1},
    cyan:{color:hex('#78c8ef'),em:[.03,.12,.19],metal:.16,rough:.22,opacity:1},
    red:{color:hex('#d53a43'),em:[.28,.015,.02],metal:.18,rough:.20,opacity:1},
    redHot:{color:hex('#ff6570'),em:[.72,.025,.035],metal:.10,rough:.18,opacity:1},
    dark:{color:hex('#07111e'),em:[0,0,0],metal:.42,rough:.38,opacity:1}
  };

  function obj(type,name,p,s,r,mat){ return {type:type,name:name,p:p||v3(0,0,0),s:s||v3(1,1,1),r:r||v3(0,0,0),mat:mat||MAT.graphite, children:[], visible:1}; }
  function add(parent,child){ parent.children.push(child); return child; }
  function group(name,p,r,s){ return obj(null,name,p||v3(0,0,0),s||v3(1,1,1),r||v3(0,0,0),MAT.graphite); }

  var root=group('root');
  var chassis=add(root,group('chassis'));
  var web=add(root,group('web'));
  var mgmt=add(root,group('mgmt'));
  var auto=add(root,group('auto'));
  var core=add(root,group('core'));
  var accents=add(root,group('accents'));

  function box(parent,name,p,s,mat,r){ return add(parent,obj('cube',name,p,s,r||v3(0,0,0),mat)); }
  function sphere(parent,name,p,s,mat){ return add(parent,obj('sphere',name,p,s,v3(0,0,0),mat)); }
  function cyl(parent,name,p,s,mat,r){ return add(parent,obj('cyl',name,p,s,r||v3(0,0,0),mat)); }
  function link(parent,name,a,b,radius,mat){
    var dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],len=Math.hypot(dx,dy,dz)||.01;
    var mid=[(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2];
    var yaw=Math.atan2(dx,dz), pitch=Math.acos(clamp(dy/len,-1,1));
    return cyl(parent,name,mid,[radius,len/2,radius],mat,[pitch,0,-yaw]);
  }

  // Architectural chassis: physical enough to read as one device even with UI switched off.
  box(chassis,'backplane',[0,0,-.58],[4.25,2.80,.16],MAT.graphite);
  box(chassis,'inner-back',[0,.02,-.36],[3.78,2.38,.08],MAT.navy);
  box(chassis,'left-rail',[-4.37,0,-.12],[.15,2.55,.24],MAT.steel);
  box(chassis,'right-rail',[4.37,0,-.12],[.15,2.55,.24],MAT.steel);
  box(chassis,'top-rail',[0,2.94,-.12],[4.20,.14,.24],MAT.steel);
  box(chassis,'bottom-rail',[0,-2.94,-.12],[4.20,.14,.24],MAT.steel);
  [-2.15,0,2.15].forEach(function(y,i){
    box(chassis,'left-lock'+i,[-4.57,y,.18],[.12,.32,.18],i===1?MAT.red:MAT.graphite2);
    box(chassis,'right-lock'+i,[4.57,y,.18],[.12,.32,.18],MAT.graphite2);
  });
  // side ribs and micro mechanics
  [-3.45,-2.8,2.8,3.45].forEach(function(x,i){
    box(chassis,'rib'+i,[x,0,-.02],[.055,2.42,.18],i===0?MAT.graphite2:MAT.navy);
  });
  for(var c=0;c<8;c++) sphere(chassis,'fastener'+c,[c<4?-4.13:4.13, 2.25-(c%4)*1.5,.18],[.07,.07,.07],MAT.steel);

  // Central physical spine.
  box(core,'spine-body',[0,0,.32],[.34,2.68,.34],MAT.graphite2);
  box(core,'spine-channel',[0,0,.76],[.095,2.46,.10],MAT.red);
  box(core,'spine-cap-top',[0,2.78,.43],[.54,.16,.46],MAT.steel);
  box(core,'spine-cap-bottom',[0,-2.78,.43],[.54,.16,.46],MAT.steel);
  for(var sy=-2;sy<=2;sy++) box(core,'spine-slot'+sy,[0,sy*.85,.90],[.18,.10,.06],sy===0?MAT.redHot:MAT.graphite2);

  // Web module: housing + actual raised interface primitives.
  box(web,'web-shell',[0,1.10,.58],[3.54,1.25,.18],MAT.graphite2);
  box(web,'web-face',[0,1.10,.81],[3.34,1.08,.08],MAT.pale);
  box(web,'web-topbar',[0,1.88,.94],[3.08,.16,.055],MAT.white);
  [-2.75,-2.47,-2.19].forEach(function(x,i){sphere(web,'web-dot'+i,[x,1.88,1.04],[.065,.065,.065],i===0?MAT.red:MAT.steel);});
  box(web,'web-address',[-.15,1.88,1.04],[1.55,.06,.045],MAT.steel);
  box(web,'web-nav',[2.42,1.88,1.04],[.34,.06,.045],MAT.blue);
  box(web,'web-eyebrow',[-1.72,1.25,1.07],[.58,.055,.05],MAT.red);
  box(web,'web-title1',[-1.26,.94,1.09],[1.05,.095,.06],MAT.navy);
  box(web,'web-title2',[-1.53,.68,1.09],[.78,.095,.06],MAT.navy);
  box(web,'web-copy1',[-1.36,.35,1.04],[.95,.035,.035],MAT.steel);
  box(web,'web-copy2',[-1.56,.20,1.04],[.75,.035,.035],MAT.steel);
  box(web,'web-cta',[-1.82,-.18,1.09],[.46,.16,.065],MAT.red);
  box(web,'web-media',[1.28,.66,1.06],[1.20,.70,.10],MAT.navy);
  sphere(web,'web-orb',[1.22,.70,1.30],[.48,.48,.28],MAT.blue);
  box(web,'web-card-a',[.54,-.15,1.17],[.46,.25,.09],MAT.white);
  box(web,'web-card-b',[1.55,-.22,1.20],[.38,.31,.10],MAT.pale);
  box(web,'web-card-c',[2.25,.05,1.16],[.28,.20,.08],MAT.red);
  [-3.25,3.25].forEach(function(x,i){box(web,'web-hinge'+i,[x,1.10,.38],[.12,.46,.20],i?MAT.steel:MAT.graphite);});

  // Management module: denser, heavier, structurally central.
  box(mgmt,'mgmt-shell',[0,-.65,.48],[3.70,1.30,.22],MAT.graphite);
  box(mgmt,'mgmt-face',[0,-.65,.76],[3.49,1.10,.08],MAT.white);
  box(mgmt,'mgmt-sidebar',[-2.92,-.65,.93],[.38,1.02,.10],MAT.navy);
  box(mgmt,'mgmt-logo',[-2.92,.02,1.08],[.17,.17,.08],MAT.red);
  for(var mi=0;mi<5;mi++) box(mgmt,'mgmt-menu'+mi,[-2.92,-.35-mi*.30,1.07],[mi===0?.22:.15,.055,.045],mi===0?MAT.red:MAT.steel);
  box(mgmt,'mgmt-head',[-.70,.16,1.00],[1.16,.09,.055],MAT.navy);
  box(mgmt,'mgmt-tool',[2.36,.16,1.00],[.42,.09,.055],MAT.blue);
  [-1.55,0,1.55].forEach(function(x,i){
    box(mgmt,'mgmt-card'+i,[x,-.29,1.02],[.62,.26,.07],i===1?MAT.pale:MAT.white);
    box(mgmt,'mgmt-card-accent'+i,[x-.43,-.29,1.12],[.06,.20,.035],i===0?MAT.red:MAT.blue);
  });
  for(var ri=0;ri<4;ri++){
    box(mgmt,'mgmt-row'+ri,[-.15,-.76-ri*.28,1.01],[1.72,.065,.045],ri===0?MAT.graphite2:MAT.steel);
    box(mgmt,'mgmt-status'+ri,[2.18,-.76-ri*.28,1.02],[.33,.075,.05],ri===1?MAT.red:MAT.pale);
  }
  [-3.42,3.42].forEach(function(x,i){box(mgmt,'mgmt-hinge'+i,[x,-.65,.22],[.14,.48,.21],i?MAT.steel:MAT.graphite2);});

  // Automation network uses volume, not a third dashboard.
  var nodes=[[-2.85,-2.28,.15],[-1.65,-2.72,.55],[0,-2.18,1.06],[1.65,-2.72,.55],[2.85,-2.28,.15],[-2.10,-1.72,.78],[2.10,-1.72,.78]];
  nodes.forEach(function(p,i){
    sphere(auto,'node'+i,p,[i===2?.22:.15,i===2?.22:.15,i===2?.22:.15],i===2?MAT.redHot:(i%2?MAT.cyan:MAT.blue));
    sphere(auto,'node-halo'+i,[p[0],p[1],p[2]-.08],[i===2?.32:.21,i===2?.32:.21,.04],MAT.graphite2);
  });
  [[0,5],[5,2],[2,6],[6,4],[0,1],[1,2],[2,3],[3,4],[5,1],[6,3]].forEach(function(pair,i){link(auto,'link'+i,nodes[pair[0]],nodes[pair[1]],.035,i===3||i===6?MAT.red:MAT.blue);});
  // vertical connectors toward the two interface modules.
  link(auto,'uplink-web',nodes[2],[0,.55,.62],.045,MAT.red);
  link(auto,'uplink-mgmt',nodes[5],[-1.5,-.25,.48],.034,MAT.blue);
  link(auto,'uplink-mgmt2',nodes[6],[1.5,-.25,.48],.034,MAT.blue);

  var packets=[];
  for(var pi=0;pi<4;pi++) packets.push(sphere(accents,'packet'+pi,[0,0,0],[.085,.085,.085],pi===0?MAT.redHot:MAT.cyan));
  var pulseNode=sphere(accents,'core-pulse',[0,-2.2,1.02],[.12,.12,.12],MAT.redHot);

  function createBufferBinding(geo){
    gl.bindBuffer(gl.ARRAY_BUFFER,geo.pb); gl.enableVertexAttribArray(loc.pos); gl.vertexAttribPointer(loc.pos,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ARRAY_BUFFER,geo.nb); gl.enableVertexAttribArray(loc.norm); gl.vertexAttribPointer(loc.norm,3,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,geo.ib);
  }

  var lastGeo=null;
  function drawNode(node,parentMatrix,focus){
    if (!node.visible) return;
    var local=compose(node.p,node.r,node.s);
    var model=mat4Mul(parentMatrix,local);
    if (node.type){
      var geo=GEO[node.type];
      if (lastGeo!==geo){ createBufferBinding(geo); lastGeo=geo; }
      var m=node.mat;
      var glow=(focus && node.name.indexOf(focus)>=0) ? .22 : 0;
      gl.uniformMatrix4fv(loc.model,false,new Float32Array(model));
      gl.uniformMatrix3fv(loc.normalMatrix,false,new Float32Array(normalMatrixFrom4(model)));
      gl.uniform3fv(loc.color,new Float32Array(m.color));
      gl.uniform3fv(loc.emissive,new Float32Array([m.em[0]+glow*.14,m.em[1]+glow*.04,m.em[2]+glow*.05]));
      gl.uniform1f(loc.metal,m.metal); gl.uniform1f(loc.rough,m.rough); gl.uniform1f(loc.opacity,m.opacity);
      gl.drawElements(gl.TRIANGLES,geo.count,gl.UNSIGNED_SHORT,0);
    }
    for(var i=0;i<node.children.length;i++) drawNode(node.children[i],model,focus);
  }

  function resize(){
    var rect=canvas.getBoundingClientRect();
    var dpr=Math.min(window.devicePixelRatio||1,1.65);
    var w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);} return [w,h,dpr];
  }

  var pointer={x:0,y:0,sx:0,sy:0};
  if (!coarseMq.matches){
    sticky.addEventListener('pointermove',function(e){
      var r=sticky.getBoundingClientRect();
      pointer.x=clamp(((e.clientX-r.left)/r.width-.5)*2,-1,1);
      pointer.y=clamp(((e.clientY-r.top)/r.height-.5)*2,-1,1);
    });
    sticky.addEventListener('pointerleave',function(){pointer.x=0;pointer.y=0;});
  }

  function sectionProgress(){
    var rect=section.getBoundingClientRect(), vh=window.innerHeight||1;
    return clamp(-rect.top/Math.max(1,section.offsetHeight-vh),0,1);
  }
  function moveGroup(g,p,r,s){g.p=p;g.r=r;g.s=s;}

  function applyScene(t,now){
    var webF=pulse(t,.13,.22,.36,.44), mgF=pulse(t,.38,.47,.59,.67), auF=pulse(t,.61,.70,.81,.89), finalF=smoothstep(.84,.96,t);
    var intro=1-smoothstep(.07,.16,t);

    // Cinematic object choreography: compact > layer extraction > operations > network explosion > reassembly.
    var rootX=lerp(1.10,2.05,finalF), rootY=lerp(.02,.38,finalF), rootS=lerp(.92,.72,finalF);
    var baseYaw=-.25 + pointer.sx*.055 + lerp(0,.08,mgF) - lerp(0,.06,auF);
    var basePitch=.12 + pointer.sy*.035 - auF*.035;
    moveGroup(root,[rootX,rootY,0],[basePitch,baseYaw,-.055+webF*.025],[rootS,rootS,rootS]);

    chassis.p=[0,0,lerp(-.18,-.54,auF)]; chassis.r=[0,0,0];
    core.p=[0,0,lerp(.02,.16,auF)];

    web.p=[lerp(0,-.28,webF)+lerp(0,-.72,auF), lerp(0,.92,webF)+lerp(0,.48,auF), lerp(0,1.08,webF)+lerp(0,.60,auF)];
    web.r=[lerp(0,-.04,webF),lerp(0,-.04,webF),lerp(0,.065,webF)+lerp(0,.04,auF)];
    var ws=1+webF*.055-auF*.02; web.s=[ws,ws,ws];

    mgmt.p=[lerp(0,.18,mgF)+lerp(0,.58,auF), lerp(0,.15,mgF)+lerp(0,.22,auF), lerp(0,1.12,mgF)+lerp(0,.42,auF)];
    mgmt.r=[lerp(0,.035,mgF),lerp(0,.025,mgF),lerp(0,-.045,mgF)+lerp(0,-.035,auF)];
    var gs=1+mgF*.06-auF*.02; mgmt.s=[gs,gs,gs];

    auto.p=[0,lerp(0,-.58,auF),lerp(0,.94,auF)];
    auto.r=[lerp(0,.08,auF),0,0]; var as=lerp(.92,1.08,auF); auto.s=[as,as,as];

    accents.p=[0,0,0];
    // pulse travels through the central spine
    pulseNode.p=[0,-2.20 + ((now*.0011)%1)*4.40,1.02];
    pulseNode.s=[.10+.07*webF,.10+.07*webF,.10+.07*webF];

    // data packets animate only when the automation phase opens.
    var paths=[
      [nodes[0],nodes[5]], [nodes[5],nodes[2]], [nodes[2],nodes[6]], [nodes[6],nodes[4]]
    ];
    packets.forEach(function(pk,i){
      var a=paths[i][0],b=paths[i][1],u=((now*.00023)+(i*.24))%1;
      pk.p=[lerp(a[0],b[0],u),lerp(a[1],b[1],u),lerp(a[2],b[2],u)+.08];
      var sc=.045+auF*.085; pk.s=[sc,sc,sc]; pk.visible=auF>.05?1:0;
    });

    // subtle material activation, used as a functional signal rather than decorative glow.
    MAT.red.em=[.18+.34*Math.max(webF,mgF,auF),.01,.015];
    MAT.redHot.em=[.50+.45*Math.max(webF,mgF,auF),.018,.024];
    MAT.blue.em=[.015,.06+.08*auF,.11+.13*auF];
    MAT.cyan.em=[.025,.11+.12*auF,.18+.20*auF];

    return {webF:webF,mgF:mgF,auF:auF,finalF:finalF,intro:intro};
  }

  var camera=[0.6,.55,13.6];
  var target=[.55,-.10,0];
  var started=false, ready=false, raf=0;

  function render(now){
    if (mobileMq.matches || reducedMq.matches) { document.documentElement.classList.remove('ds-webgl-ready'); cancelAnimationFrame(raf); return; }
    pointer.sx += (pointer.x-pointer.sx)*.045;
    pointer.sy += (pointer.y-pointer.sy)*.045;
    var size=resize(), aspect=size[0]/size[1];
    var p=sectionProgress();
    applyScene(p,now||0);

    gl.clearColor(0,0,0,0); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
    var proj=perspective(35*Math.PI/180,aspect,.1,100);
    var camX=.45+pointer.sx*.14, camY=.45-pointer.sy*.10, camZ=13.4;
    camera=[camX,camY,camZ];
    target=[.78,-.03,0];
    var view=lookAt(camera,target,[0,1,0]);
    gl.uniformMatrix4fv(loc.projection,false,new Float32Array(proj));
    gl.uniformMatrix4fv(loc.view,false,new Float32Array(view));
    gl.uniform3fv(loc.camera,new Float32Array(camera));
    gl.uniform3fv(loc.keyDir,new Float32Array(norm([-1.4,-2.2,-3.4])));
    gl.uniform3fv(loc.fillDir,new Float32Array(norm([2.4,-.4,-2.1])));
    lastGeo=null;
    try {
      drawNode(root,mat4Identity(),null);
      if (!ready && gl.getError() === gl.NO_ERROR) {
        ready = true;
        document.documentElement.classList.add('ds-webgl-ready');
      }
    } catch (err) {
      document.documentElement.classList.remove('ds-webgl-ready');
      ready = false;
      started = false;
      return;
    }
    raf=requestAnimationFrame(render);
  }

  function onMedia(){
    if (mobileMq.matches || reducedMq.matches) {
      document.documentElement.classList.remove('ds-webgl-ready');
      ready=false;
      if(raf)cancelAnimationFrame(raf);
      started=false;
    } else if(!started){
      started=true; raf=requestAnimationFrame(render);
    }
  }
  if (mobileMq.addEventListener) mobileMq.addEventListener('change',onMedia);
  if (reducedMq.addEventListener) reducedMq.addEventListener('change',onMedia);
  canvas.addEventListener('webglcontextlost', function (event) {
    event.preventDefault();
    document.documentElement.classList.remove('ds-webgl-ready');
    ready=false;
    if(raf)cancelAnimationFrame(raf);
  }, false);
  window.addEventListener('pagehide',function(){if(raf)cancelAnimationFrame(raf);});
  started=true; raf=requestAnimationFrame(render);
})();
