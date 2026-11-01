export function versioned(app) {
  const request=app.request.bind(app);
  app.request=(url,init={},env)=>{const headers=new Headers(init.headers);headers.set('X-Trendbeak-Data','bars-v1');return request(url,{...init,headers},env);};
  return app;
}
