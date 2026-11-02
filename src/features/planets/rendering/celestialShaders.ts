export const celestialVertex = /* glsl */ `
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vLocal;
  varying vec3 vWorld;
  varying vec3 vNormalWorld;
  void main() {
    vLocal = position;
    vec4 world = modelMatrix * vec4(position, 1.0);
    vWorld = world.xyz;
    vNormalWorld = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * world;
    #include <logdepthbuf_vertex>
  }
`;

const noise = /* glsl */ `
  float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise3(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x),
      mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x),
      mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.55;
    for (int i = 0; i < 4; i++) { v += noise3(p) * a; p = p * 2.03 + 5.17; a *= 0.5; }
    return v;
  }
`;

export const surfaceFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uA, uB, uC, uLight;
  uniform float uSeed, uPattern, uStar, uBrightness, uAmbient;
  varying vec3 vLocal, vWorld, vNormalWorld;
  ${noise}
  void main() {
    #include <logdepthbuf_fragment>
    vec3 p = normalize(vLocal);
    float n = fbm(p * 4.2 + uSeed);
    vec3 color;
    vec3 emission = vec3(0.0);
    if (uStar > 0.5) {
      color = mix(uA, uB, n * 0.42) * uBrightness * (0.75 + n * 0.55);
    } else {
      color = mix(uA, uB, smoothstep(0.25, 0.72, n));
      if (uPattern < 0.5) {
        float land = smoothstep(0.49, 0.53, n);
        color = mix(uA * (0.65 + n), uB * (0.55 + n), land);
        float clouds = smoothstep(0.58, 0.73, fbm(p * 7.0 + uSeed + 30.0));
        float ice = smoothstep(0.79, 0.95, abs(p.y) + n * 0.12);
        color = mix(color, uC, max(clouds * 0.82, ice));
      } else if (uPattern < 1.5) {
        float ridges = sin(n * 35.0 + p.y * 12.0) * 0.5 + 0.5;
        color = mix(color, uC, ridges * 0.2);
      } else if (uPattern < 2.5) {
        float cracks = 1.0 - smoothstep(0.015, 0.065, abs(n - 0.5));
        color = mix(mix(uB, uC, n), uA, cracks * 0.9);
      } else if (uPattern < 3.5) {
        float lava = 1.0 - smoothstep(0.008, 0.035, abs(n - 0.51));
        color = mix(uA, uB, n * 0.55);
        emission = uC * lava * 1.6;
      } else if (uPattern < 4.5) {
        float bands = sin(p.y * 42.0 + n * 8.0 + sin(p.x * 9.0) * 0.25) * 0.5 + 0.5;
        color = mix(uA, uB, smoothstep(0.1, 0.85, bands));
        color = mix(color, uC, smoothstep(0.75, 0.95, bands) * 0.65);
        color *= 0.8 + fbm(p * 18.0 + uSeed) * 0.4;
        vec3 center=normalize(vec3(sin(uSeed)*.9,.22,cos(uSeed)*.9));
        vec3 east=normalize(cross(center,vec3(0.,1.,0.)));
        vec2 storm=vec2(dot(p,east)*.65,p.y-center.y);
        float vortex=exp(-dot(storm,storm)*220.)*smoothstep(.75,.95,dot(p,center));
        float swirl=sin(atan(storm.y,storm.x)*3.+length(storm)*95.)*.5+.5;
        color=mix(color,mix(uA,uC,swirl),vortex*.85);
      } else {
        float craters = smoothstep(0.3, 0.6, noise3(p * 28.0 + uSeed));
        color *= 0.65 + craters * 0.5;
      }
      float daylight = max(0.0, dot(normalize(vNormalWorld), normalize(uLight)));
      color *= uAmbient + daylight * 1.18;
      color += emission;
    }
    gl_FragColor = vec4(color, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const atmosphereFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor, uLight;
  uniform float uStrength, uStar;
  varying vec3 vWorld, vNormalWorld;
  void main() {
    #include <logdepthbuf_fragment>
    vec3 normal = normalize(vNormalWorld);
    float rim = pow(1.0 - abs(dot(normal, normalize(cameraPosition - vWorld))), 3.0);
    float daylight = mix(0.18 + max(0.0, dot(normal, normalize(uLight))), 1.0, uStar);
    gl_FragColor = vec4(uColor * (1.1 + uStar), rim * uStrength * daylight);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export const ringFragment = /* glsl */ `
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uColor, uLight, uCenter;
  uniform float uInner, uOuter, uRadius;
  varying vec3 vLocal, vWorld, vNormalWorld;
  void main() {
    #include <logdepthbuf_fragment>
    float r = length(vLocal.xy);
    float band = sin(r * 170.0) * 0.5 + 0.5;
    float fine = sin(r * 490.0 + sin(r * 71.0)) * 0.5 + 0.5;
    float opacity = (0.25 + band * 0.4 + fine * 0.18) * smoothstep(uInner, uInner + 0.04, r)
      * (1.0 - smoothstep(uOuter - 0.06, uOuter, r));
    vec3 relative = vWorld - uCenter;
    float along = dot(relative, normalize(uLight));
    float distanceToRay = length(relative - normalize(uLight) * along);
    float shadow = along < 0.0 ? smoothstep(uRadius * 0.92, uRadius * 1.04, distanceToRay) : 1.0;
    float light = 0.4 + abs(dot(normalize(vNormalWorld), normalize(uLight))) * 0.55;
    gl_FragColor = vec4(uColor * mix(0.12, light, shadow) * (0.65 + band * 0.4), opacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;
