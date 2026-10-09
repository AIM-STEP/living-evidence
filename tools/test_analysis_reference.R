# Independent numerical check against metafor, using synthetic data only.
suppressPackageStartupMessages(library(metafor))
library(jsonlite)
dir <- file.path('..','data','synthetic','analysis')
dat <- fromJSON(file.path(dir,'binary.json'))
expected <- fromJSON(file.path(dir,'expected-js.json'),simplifyVector=FALSE)
a <- dat[dat$treat=='Active',]; b <- dat[dat$treat=='Control',]
for (measure in c('RR','OR')) {
 es <- escalc(measure=measure,ai=a$event,bi=a$n-a$event,ci=b$event,di=b$n-b$event)
 fit <- rma(es$yi,es$vi,method='DL',test='z')
 js <- expected[[measure]]
 stopifnot(abs(as.numeric(fit$b)-js$fit$theta[[1]])<1e-10,
           abs(fit$se-sqrt(js$fit$C[[1]][[1]]))<1e-10,
           abs(fit$tau2-js$tau2)<1e-10,
           abs(fit$QE-js$Q)<1e-10)
}
cat('PASS RR/OR pooled estimates, SE, DL tau² and Q match R metafor to 1e-10\n')
dat <- fromJSON(file.path(dir,'continuous.json')); expected <- fromJSON(file.path(dir,'continuous-js.json'),simplifyVector=FALSE)
a<-dat[dat$treat=='Active',]; b<-dat[dat$treat=='Control',]
for (measure in c('MD','SMD')) {
 es<-escalc(measure=measure,m1i=a$mean,sd1i=a$sd,n1i=a$n,m2i=b$mean,sd2i=b$sd,n2i=b$n)
 fit<-rma(es$yi,es$vi,method='DL',test='z'); js<-expected[[measure]]
 stopifnot(abs(as.numeric(fit$b)-js$fit$theta[[1]])<1e-8,abs(fit$se-sqrt(js$fit$C[[1]][[1]]))<1e-8,abs(fit$tau2-js$tau2)<1e-8)
}
cat('PASS MD/SMD effect estimates, SE and tau² match R metafor to 1e-8\n')
d<-fromJSON(file.path(dir,'multiarm.json'));js<-fromJSON(file.path(dir,'multiarm-js.json'))
y<-c(d$mean[2]-d$mean[1],d$mean[3]-d$mean[1],d$mean[5]-d$mean[4],d$mean[7]-d$mean[6])
v<-d$sd^2/d$n
V<-diag(c(v[1]+v[2],v[1]+v[3],v[4]+v[5],v[6]+v[7]));V[1,2]<-V[2,1]<-v[1]
X<-rbind(c(1,0),c(0,1),c(1,0),c(-1,1))
fit<-rma.mv(yi=y,V=V,mods=X,intercept=FALSE)
stopifnot(max(abs(as.numeric(fit$b)-unlist(js$fit$theta)))<1e-9,max(abs(fit$vb-js$fit$C))<1e-9)
cat('PASS correlated three-arm network estimates and covariance match R metafor rma.mv to 1e-9\n')
