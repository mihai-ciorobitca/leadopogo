from requests import get
from json import loads

def get_credits():
    url = 'https://app.xemailextractor.com/api/client/credits/'
    headers = {
      "Authorization": "Token 819f562d876a1ab74816b332878cfe517706fa18"
    }
    response = get(url, headers=headers)
    return loads(response.text)["credits_left"]
