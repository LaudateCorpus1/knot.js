/*
    accessPointerProvider:
        an object which provide the ability of setting value/getting value/eventChange for specified
        access point on the target

    this is the interface of access point provider:
    {
        doesSupport:function(target, accessPointName);  //required. return true if the access point on the target is supported
        getValue:function(target, accessPointName); //required. get current value for the access point on the target
        setValue:function(target, accessPointName, value); //required. get current value for the access point on the target
        doesSupportMonitoring:function(target, accessPointName); //required. return true if the access point support data awareness

        monitor:function(target, accessPointName, callback); //optional. monitor the change of the access point (on the target)
        stopMonitoring:function(target, accessPointName, callback) //optional. stop monitoring the change of the access point(on the target)
    }

 */

(function(){
    var __private = Knot.getPrivateScope();

    var _APProviders = [];

    var DummyProvider = {
        doesSupport:function(target, apName){
            return true;
        },
        getValue:function(target, apName){
            return undefined;
        },
        setValue:function(target, apName, value){
        },
        doesSupportMonitoring:function(target, apName){
            return true;
        },
        monitor:function(target, apName, callback){
        },
        stopMonitoring:function(target, apName, callback){
        }
    };



    __private.AccessPointManager = {
        //search the provider in reversed sequence, so that the later registered providers can
        //overwrite the default ones
        getProvider:function(target, apName){
            for(var i=_APProviders.length-1; i >= 0; i--){
                if(_APProviders[i].doesSupport(target, apName))
                    return _APProviders[i];
            }

            __private.Log.error(__private.Log.Source.Knot,   "Failed to find Access Point Provider for Access Point '" + apName + "', target:" + target);
            return DummyProvider;
        },
        registerAPProvider: function(apProvider){
            if(_APProviders.indexOf(apProvider) < 0)
                _APProviders.push(apProvider);
        },

        getValueThroughPipe: function(target, ap){
            var value = ap.provider.getValue(target, ap.name);
            if(ap.pipes){
                for(var i=0; i< ap.pipes.length; i++){
                    var p = __private.GlobalSymbolHelper.getSymbol(ap.pipes[i]);
                    if(typeof(p) != "function"){
                        __private.Log.error(__private.Log.Source.Knot, "Pipe must be a function. pipe name:" + ap.pipes[i]);
                    }
                    value = p.apply(target, [value]);
                }
            }
            return value;
        },

        monitor:function(src, srcAP, target, targetAP){
            if(srcAP.provider.doesSupportMonitoring(src, srcAP.name)){
                srcAP.changedCallback = function(){
                    targetAP.provider.setValue(target, targetAP.name,
                        __private.AccessPointManager.getValueThroughPipe(src,  srcAP));
                };

                srcAP.provider.monitor(src, srcAP.name, srcAP.changedCallback);
            }
        },

        stopMonitoring:function(target, ap){
            var provider = this.getProvider(target, ap.name);
            provider.stopMonitoring(target, ap.name, ap.changedCallback);
        },

        tieKnot:function(leftTarget, rightTarget, knotInfo){
            if(knotInfo.leftAP.isComposite || knotInfo.rightAP.isComposite){
                var compositeAP, compositeAPTarget, normalAP, normalTarget;
                if(knotInfo.leftAP.isComposite){
                    compositeAP = knotInfo.leftAP; compositeAPTarget = leftTarget;
                    normalAP = knotInfo.rightAP; normalTarget = rightTarget;
                }
                else{
                    compositeAP = knotInfo.rightAP; compositeAPTarget = rightTarget;
                    normalAP = knotInfo.leftAP; normalTarget = leftTarget;
                }

                for(var i=0; i< compositeAP.childrenAPs.length; i++){
                    compositeAP.childrenAPs[i].provider = __private.AccessPointManager.getProvider(compositeAPTarget, compositeAP.childrenAPs[i].name);
                }
                normalTarget.provider = __private.AccessPointManager.getProvider(normalAP.name);

                compositeAP.changedCallback = function(){
                    var values=[];
                    for(var i=0; i< compositeAP.childrenAPs.length; i++){
                        values.push(__private.AccessPointManager.getValueThroughPipe(compositeAPTarget, compositeAP.childrenAPs[i]));
                    }

                    var p = __private.GlobalSymbolHelper.getSymbol(compositeAP.nToOnePipe);
                    if(typeof(p) != "function"){
                        __private.Log.error(__private.Log.Source.Knot, "Pipe must be a function. pipe name:" + compositeAP.nToOnePipe);
                    }
                    var lastValue = p.apply(compositeAP, [values]);

                    normalTarget.provider.setValue(normalTarget, normalAP.name, lastValue);
                }

                for(var i=0; i< compositeAP.childrenAPs.length; i++){
                    if(compositeAP.childrenAPs[i].provider.doesSupportMonitoring(compositeAPTarget, compositeAP.childrenAPs[i])){
                        compositeAP.childrenAPs[i].provider.monitor(compositeAPTarget, compositeAP.childrenAPs[i].name, compositeAP.changedCallback);
                    }
                }
                //set the initial value
                compositeAP.changedCallback();
            }
            else{
                knotInfo.leftAP.provider = this.getProvider(leftTarget, knotInfo.leftAP.name);
                knotInfo.rightAP.provider = this.getProvider(rightTarget, knotInfo.rightAP.name);

                //set initial value, always use the left side value as initial value
                knotInfo.leftAP.provider.setValue(leftTarget, knotInfo.leftAP.name,
                    this.getValueThroughPipe(rightTarget,  knotInfo.rightAP));

                this.monitor(leftTarget, knotInfo.leftAP, rightTarget, knotInfo.rightAP);
                this.monitor(rightTarget, knotInfo.rightAP, leftTarget, knotInfo.leftAP);
            }
        },

        untieKnot: function(leftTarget, rightTarget, knotInfo){
            if(knotInfo.leftAP.isComposite || knotInfo.rightAP.isComposite){
                var compositeAP, compositeAPTarget;
                if(knotInfo.leftAP.isComposite){
                    compositeAP = knotInfo.leftAP; compositeAPTarget = leftTarget;
                }
                else{
                    compositeAP = knotInfo.rightAP; compositeAPTarget = rightTarget;
                }

                for(var i=0; i< compositeAP.childrenAPs.length; i++){
                    if(compositeAP.childrenAPs[i].provider.doesSupportMonitoring(compositeAPTarget, compositeAP.childrenAPs[i])){
                        compositeAP.childrenAPs[i].provider.stopMonitoring(compositeAPTarget, compositeAP.childrenAPs[i].name, compositeAP.changedCallback);
                    }
                }

                delete compositeAP.changedCallback;
            }
            else{
                this.stopMonitoring(leftTarget, knotInfo.leftAP);
                delete knotInfo.leftAP.changedCallback;
                this.stopMonitoring(rightTarget, knotInfo.rightAP);
                delete knotInfo.rightAP.changedCallback;
            }
        }
    };

})();