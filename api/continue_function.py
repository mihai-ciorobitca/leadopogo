import requests
from token_function import get_token

def get_continue(name, scraping_info, scrape_type, max_emails):
    url = 'https://app.xemailextractor.com/api/client/'
    headers = {
      "Authorization": f"Token {get_token()}",
      "Content-Type": "application/json"
    }
    payload = {
      "name": name,
      "scrape_info": scraping_info,
      "scrape_type": "CO",
      "maximum_emails": int(max_emails)
    }

    requests.post(url, json=payload, headers=headers)