from requests import post
from json import loads

def get_create(name, scraping_info, scrape_type, max_emails):
    url = 'https://app.xemailextractor.com/api/client/'
    headers = {
      "Authorization": "Token 819f562d876a1ab74816b332878cfe517706fa18",
      "Content-Type": "application/json"
    }
    payload = {
      "name": name,
      "scrape_info": scraping_info,
      "scrape_type": scrape_type,
      "maximum_emails": max_emails
    }
    response = post(url, json=payload, headers=headers)
    return loads(response.text)