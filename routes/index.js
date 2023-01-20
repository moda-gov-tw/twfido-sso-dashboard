var sha3_512 = require('js-sha3').sha3_512;

async function getAccessToken() {
  let url = `https://login.microsoftonline.com/${process.env.AAD_TENANT_ID}/oauth2/v2.0/token`;
  let params = new URLSearchParams();
  params.append('client_id', process.env.AAD_CLEINT_ID);
  params.append('client_secret', process.env.AAD_CLEINT_SECRET);
  params.append('scope', 'https://graph.microsoft.com/.default');
  params.append('grant_type', 'client_credentials');

  let options = {
    method: 'POST',
    body: params
  };

  try {
    let response = await fetch(url, options);
    response = await response.json();
    return response.access_token;
  } catch (err) {
    res.status(500).json({ msg: `Internal Server Error.` });
  }
}

async function createExtension(mail, access_token) {
  url = `https://graph.microsoft.com/v1.0/users/${mail}/extensions/`;
  options = {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + access_token,
      'Content-type': 'application/json'
    },
    body: JSON.stringify({
      id: 'twfido'
    })
  };

  let response;
  try {
    response = await fetch(url, options);
  } catch (err) {
    res.status(500).json({ msg: `Create extension failed.` });
  }
}

var express = require('express');
const { response } = require('../app');
var router = express.Router();

/* GET home page. */
router.get('/', function (req, res, next) {
  res.render('index', { title: '行動自然人憑證單一登入管理後台' });
});

router.get('/users.json', async function (req, res, next) {
  const access_token = await getAccessToken();
  url = 'https://graph.microsoft.com/v1.0/users?$select=displayName,userPrincipalName&$expand=extensions&$top=999';
  options = {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + access_token
    }
  };

  try {
    let r = await fetch(url, options);
    r = await r.json();
    r = r.value.filter(i => !i.userPrincipalName.endsWith('onmicrosoft.com'));

    r = r.map(i => {
      const obj = i;

      if (i.extensions) {
        const find = i.extensions.filter(j => j.id == 'twfido');
        if (find.length > 0) {
          obj.twid = find[0].twid ? "set" : "unset";
          obj.pwd = find[0].twid ? "set" : "unset";
          obj.pwd_expiry = find[0].pwd_expiry;
        } else {
          obj.twid = "unset";
          obj.pwd = "unset";
          obj.pwd_expiry = null;
        }
      } else {
        obj.twid = "unset";
        obj.pwd = "unset";
        obj.pwd_expiry = null;
      }

      return obj;
    });

    res.json(r);
  } catch (err) {
    res.status(500).json({ msg: err });
  }

});

router.get('/:mail', async function (req, res, next) {
  const access_token = await getAccessToken();
  url = `https://graph.microsoft.com/v1.0/users/${req.params.mail}?$select=id,displayName,userPrincipalName&$expand=extensions`;
  options = {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + access_token
    }
  };

  let r;
  let pwd_expiry = null;
  try {
    r = await fetch(url, options);
    r = await r.json();
    const find = r.extensions.filter(i => i.id == 'twfido');

    if (find.length > 0) {
      pwd_expiry = find[0].pwd_expiry ?? null;
    }
  } catch (err) {
    res.status(500).json({ msg: `Internal Server Error.` });
  }

  res.render('user', { title: '編輯使用者', id: r.id, mail: r.userPrincipalName, name: r.displayName, pwd_expiry: pwd_expiry });
});

router.post('/:mail', async function (req, res, next) {
  const data = {
    twid: null,
    pwd: null,
    pwd_expiry: null
  };

  const access_token = await getAccessToken();

  let url = `https://graph.microsoft.com/v1.0/users/${req.params.mail}/extensions/twfido`;
  let options = {
    method: 'GET',
    headers: {
      Authorization: 'Bearer ' + access_token
    }
  };

  try {
    let r = await fetch(url, options);
    if (r.status == 404) {
      await createExtension(req.params.mail, access_token);
    } else {
      r = await r.json();
      data.twid = r.twid ?? null;
      data.pwd = r.pwd ?? null;
      data.pwd_expiry = r.pwd_expiry ?? null;
    }
  } catch (err) {
    res.status(500).json({ msg: `Get extension failed.` + err });
  }

  data.pwd_expiry = req.body.pwd_expiry;
  if (req.body.twid)
    data.twid = sha3_512(req.body.twid);
  if (req.body.pwd)
    data.pwd = sha3_512(req.body.pwd);

  url = `https://graph.microsoft.com/v1.0/users/${req.params.mail}/extensions/twfido`;
  options = {
    method: 'PATCH',
    headers: {
      Authorization: 'Bearer ' + access_token,
      'Content-type': 'application/json'
    },
    body: JSON.stringify(data)
  };

  try {
    let r = await fetch(url, options);
    res.send("done");
  } catch (err) {
    res.status(500).json({ msg: err });
  }
});

module.exports = router;
