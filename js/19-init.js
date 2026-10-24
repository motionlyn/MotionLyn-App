if(window.ML&&ML.applyUi)ML.applyUi();if(window.ML&&ML.applyTheme)ML.applyTheme();
ML.editVer = () => ML.lsGet('ml.editver') === 'am' ? 'am' : 'ml';
ML.setEditVer = v => { ML.lsSet('ml.editver', v === 'am' ? 'am' : 'ml'); document.documentElement.setAttribute('data-ver', ML.editVer()); };
document.documentElement.setAttribute('data-ver', ML.editVer());
