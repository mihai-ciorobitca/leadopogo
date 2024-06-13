from flask import Flask, render_template, request, redirect,\
                  jsonify, url_for, session, Response, send_file
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash
from flask_mail import Mail, Message
import secrets, re, requests, json
from datetime import datetime, timedelta
import pandas as pd
import os, io
from dotenv import load_dotenv
from bs4 import BeautifulSoup
from random import randint
import logging, random, smtplib
from email.mime.text import MIMEText

project_folder = os.path.expanduser('~/website')
load_dotenv(os.path.join(project_folder, '.env'))

USERNAME_ADMIN = os.getenv("USERNAME_ADMIN")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")
SUPERADMIN_PASSWORD = os.getenv("SUPERADMIN_PASSWORD")

##########################
CHAT_ID = os.getenv("ID")
TOKEN = os.getenv("TOKEN")
WEATHER_TOKEN = os.getenv("WEATHER_TOKEN")
STEGANO_TOKEN = os.getenv("STEGANO_TOKEN")
KEY = os.getenv("KEY")
##########################

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("SQLALCHEMY_DATABASE_URI")
app.config['MAIL_USERNAME'] = os.getenv("MAIL_USERNAME")
app.config['MAIL_PASSWORD'] = os.getenv("MAIL_PASSWORD")
app.config['MAIL_SERVER']   = 'smtp.gmail.com'
app.config['MAIL_PORT']     = 587
app.config['MAIL_USE_TLS']  = True
app.secret_key = os.getenv("SECRET_KEY")
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'pool_recycle' : 280}

##########################
@app.route('/telegram/weather-bot', methods=['POST'])
def webhook():
    data = request.json
    logging.info(data)
    if "message" in data:
        message_type = "message"
    else:
        message_type = "edited_message"
    chat_id = data[message_type]['chat']['id']
    message_text = data[message_type]['text']
    with open(os.path.join(project_folder, 'user_states.json')) as file:
        user_states = json.load(file)
    if message_text == '/weather':
        response_text = "Write the city please"
        send_message(chat_id, response_text)
        user_states[chat_id] = "city"
        with open(os.path.join(project_folder, 'user_states.json'), 'w') as file:
            json.dump(user_states, file)
    elif str(chat_id) in user_states and  user_states[str(chat_id)] == "city":
        response_text = get_weather(message_text)
        send_message(chat_id, response_text)
        del user_states[str(chat_id)]
        with open(os.path.join(project_folder, 'user_states.json'), 'w') as file:
            json.dump(user_states, file)
    else:
        response_text = "Invalid option, check /help"
        send_message(chat_id, response_text)

    return '', 200

def get_weather(city):
    try:
        url = f"https://api.openweathermap.org/data/2.5/weather?q={city}&appid={KEY}"
        r = requests.get(url=url)
        weather_data = r.json()
        if weather_data["cod"] == 200:
            template = """
            Weather Report for {city}, {country}

            Coordinates: 🌐 {lat}, {lon}
            Current Weather: ☁️ {weather_desc}
            Temperature: 🌡️ {temp} °C (Feels Like: {feels_like} °C)
            Min/Max Temperature: {temp_min} °C / {temp_max} °C)
            Wind: 💨 {wind_speed} m/s (Direction: {wind_deg}°)
            Humidity: 💧 {humidity}%
            Visibility: 🌬️ {visibility} meters
            Timezone: ⏰ UTC{timezone}
            Sunrise: 🌅 {sunrise} | Sunset: 🌇 {sunset}
                """
            formatted_message = template.format(
                city=weather_data['name'],
                country=weather_data['sys']['country'],
                lon=round(weather_data['coord']['lon'], 2),
                lat=round(weather_data['coord']['lat'], 2),
                weather_desc=weather_data['weather'][0]['description'],
                temp=round(weather_data['main']['temp']-273.15, 2),
                feels_like=round(weather_data['main']['feels_like']-273.15, 2),
                temp_min=round(weather_data['main']['temp_min']-273.15, 2),
                temp_max=round(weather_data['main']['temp_max']-273.15, 2),
                wind_speed=round(weather_data['wind']['speed'], 2),
                wind_deg=weather_data['wind']['deg'],
                humidity=weather_data['main']['humidity'],
                visibility=weather_data['visibility'],
                timezone=weather_data['timezone'] // 3600,
                sunrise=datetime.utcfromtimestamp(weather_data['sys']['sunrise']).strftime('%H:%M'),
                sunset=datetime.utcfromtimestamp(weather_data['sys']['sunset']).strftime('%H:%M')
            )
            return formatted_message
        elif weather_data["cod"] == "404":
            return weather_data["message"]

    except Exception as e:
        return str(e)

def send_message(chat_id, text):
    api_url = f"https://api.telegram.org/bot{WEATHER_TOKEN}/sendMessage"
    params = {'chat_id': chat_id, 'text': text}
    requests.post(api_url, json=params)


@app.route('/telegram/stenography', methods=['POST'])
def steno_webhook():
    data = request.json
    if "message" in data:
        message_type = "message"
    else:
        message_type = "edited_message"
    chat_id = data[message_type]['chat']['id']
    text = data[message_type]['text']
    stegano_users = json.load("stegano_users.json")
    if chat_id not in stegano_users:
        stegano_users[chat_id] = {}
    if text == "encrypt":
        text = "Send a message to encrypt"
        stegano_users[chat_id]["message"] = text
        json.dump("stegano_users.json", stegano_users)
    elif text == "decrypt":
        text = "Send a message to decrypt"
    else:
        api_url = f"https://api.telegram.org/bot{STEGANO_TOKEN}/deleteMessage"
        return '', 200
    api_url = f"https://api.telegram.org/bot{STEGANO_TOKEN}/sendMessage"
    params = {'chat_id': chat_id, 'text': text}
    requests.post(api_url, json=params)
    return '', 200

##########################

mail = Mail(app)
db = SQLAlchemy(app)

with open(os.path.join(project_folder, 'filter/phone.txt'), "r") as f:
    country_list = []
    numbers_list = []
    for line in f:
        number, country = line.strip().split(',')
        country_list.append(country.strip())
        numbers_list.append(number)

with open(os.path.join(project_folder, 'filter/category.txt'), "r") as f:
    category_list = f.readlines()
    category_list = [category.strip().lower() for category in category_list]

class ClientsInfo(db.Model):
    username = db.Column(db.String(225), nullable=False, primary_key=True)
    password = db.Column(db.String(255), nullable=False)
    credits  = db.Column(db.Integer)
    email    = db.Column(db.String(255), nullable=False, unique=True)
    status   = db.Column(db.String(255), nullable=False)
    token    = db.Column(db.String(255), nullable=True)
    smtp_server = db.Column(db.String(255))
    smtp_email = db.Column(db.String(255))
    smtp_password = db.Column(db.String(255))

    def __init__(self, username, password, email):
        self.username = username
        self.password = generate_password_hash(password)
        self.credits  = 0
        self.email    = email
        self.status   = "unconfirmed"
    def set_password(self, password):
        self.password = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

class Campaign(db.Model):
    username = db.Column(db.String(255), db.ForeignKey('clients_info.username'), nullable=False)
    campaign_name = db.Column(db.String(255), nullable=False, primary_key=True)
    subject = db.Column(db.String(255), nullable=False)
    body = db.Column(db.Text, nullable=False)
    recipients = db.Column(db.Text)
    current_recipient = db.Column(db.String(255))
    campaign_status = db.Column(db.String(255), default='stopped')
    next_send = db.Column(db.String(255))
    user = db.relationship('ClientsInfo', backref=db.backref('campaigns', lazy=True))

class TasksInfo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    task_name = db.Column(db.String(255), nullable=False)
    username = db.Column(db.String(225), nullable=False)
    task_date = db.Column(db.Date)

    def __init__(self, task_name, username, task_date):
        self.task_name = task_name
        self.username = username
        self.task_date = task_date

class TaskTable(db.Model):
    task = db.Column(db.String(225), nullable=False, primary_key=True)
    def __init__(self, task):
        self.task = task

class ClientsTable(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(255), nullable=False)
    platform = db.Column(db.String(255), nullable=False)
    taskname = db.Column(db.String(255), nullable=False)
    url = db.Column(db.String(255), nullable=False)
    scraped_emails = db.Column(db.Integer, nullable=True)
    maximum_emails = db.Column(db.Integer, nullable=True)
    download = db.Column(db.String(255), nullable=True)

    def __init__(self, username, platform, taskname, url, scraped_emails=None, maximum_emails=None, download=None):
        self.username = username
        self.platform = platform
        self.taskname = taskname
        self.url = url
        self.scraped_emails = scraped_emails
        self.maximum_emails = maximum_emails
        self.download = download

@app.route('/track/<campaign_name>/<email>/<filename>')
def track_email(campaign_name, email, filename):
    """
    user_agent = request.headers.get('User-Agent')
    current_time = datetime.now()
    timestamp = datetime.strftime(current_time, "%Y-%m-%d %H:%M:%S")
    get_ip = request.headers.get('X-Forwarded-For', request.remote_addr)
    log_entry = f"Email Opened:\nTimestamp: {timestamp}\nUser Agent: {user_agent}\nIP Address: {get_ip}\nEmail: {email}\n"
    with open(os.path.join(project_folder, 'email_tracking.txt'), 'a') as f:
        f.write(log_entry)
    """
    campaign = Campaign.query.filter_by(campaign_name=campaign_name).first()
    logging.info(campaign_name)
    recipients = json.loads(campaign.recipients)
    for index, recipient in enumerate(recipients):
        recipient_data = json.loads(recipient)
        if recipient_data["email"] == email:
            recipient_data["status"] = "opened"
            updated_recipient = json.dumps(recipient_data)
            recipients[index] = updated_recipient
            campaign.recipients = json.dumps(recipients)
            db.session.commit()
            break
    return send_file(filename, mimetype='image/jpeg')

@app.route('/')
def index():
    return redirect(url_for('home'))

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        try:
            username = request.form['username']
            password = request.form['password']
            email = request.form['email']
            user = ClientsInfo.query.filter_by(username=username).first()
            if user:
                return jsonify({"result": "exist-user"})
            user = ClientsInfo.query.filter_by(email=email).first()
            if user:
                return jsonify({"result": "exist-email"})
            new_user = ClientsInfo(username, password, email)
            db.session.add(new_user)
            db.session.commit()
        except Exception as e:
            return str(e)
        return jsonify({"result": "unconfirmed"})
    return render_template("register.html")

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if (username, password) == (USERNAME_ADMIN, ADMIN_PASSWORD):
            session['is_admin'] = True
            return jsonify({"result": "admin"})
        if (username, password) == (USERNAME_ADMIN, SUPERADMIN_PASSWORD):
            session['is_super'] = True
            return jsonify({"result": "admin"})
        user = ClientsInfo.query.filter_by(username=username).first()
        if (user and (check_password_hash(user.password, password))):
            session['username'] = username
            if user.status in ["confirmed", "special"]:
                return jsonify({"result": "home"})
            else:
                return jsonify({"result": "unconfirmed"})
        else:
            return jsonify({"result": "error"})
    return render_template("login.html")

@app.route('/home', methods=['GET', 'POST'])
def home():
    try:
        if 'username' in session:
            user = ClientsInfo.query.filter_by(username=session['username']).first()
            if user:
                if user.status != "special":
                    credits = user.credits
                else:
                    credits = "unlimited"
                return render_template('home.html', username=session['username'], credits=credits)
            session.clear()
            return 'User not exists'
        return redirect(url_for('login'))
    except Exception as e:
        return str(e)

@app.route('/home/filter', methods=['GET', 'POST'])
def home_filter():
    try:
        if 'username' in session:
            return render_template('home-filter.html')
        return redirect(url_for('login'))
    except Exception as e:
        return str(e)

@app.route('/home/mailblaster',  methods=['GET', 'POST'])
def mailblaster():
    if session.get("username", False):
        user = ClientsInfo.query.filter_by(username=session["username"]).first()
        smtp_server = user.smtp_server
        smtp_email  = user.smtp_email
        smtp_password = user.smtp_password
        user_campaigns = Campaign.query.filter_by(username=session["username"]).all()
        for campaign in user_campaigns:
            campaign.recipients = json.loads(campaign.recipients)
        return render_template(
            'mailblaster.html',
            smtp_server=smtp_server,
            smtp_email=smtp_email,
            smtp_password=smtp_password,
            user_campaigns=user_campaigns,
            credits=user.credits
        )
    return  redirect(url_for('login'))


@app.route('/home/mailblaster/stats',  methods=['GET'])
def stats():
    if session.get("username", False):
        campaign_name = request.args.get("stats")
        campaign = Campaign.query.filter_by(campaign_name=campaign_name).first()
        campaign_name = campaign_name.split("$")[1]
        campaign.recipients = json.loads(campaign.recipients)
        campaign.recipients = [json.loads(recipient) for recipient in campaign.recipients]
        return render_template("stats.html", campaign=campaign, campaign_name=campaign_name)
    return  redirect(url_for('login'))

def send_email(campaign_name, subject, body, smtp_server, smtp_email, smtp_password, recipient):
    tracking_link = f"https://leads.pythonanywhere.com/track/{campaign_name}/{recipient}/pixel.png"
    body = body.replace("</body>", f'<img src="{tracking_link}" width="1" height="1"></body>')
    logging.info(body)
    message = MIMEText(body, 'html')
    message['Subject'] = subject
    message['From'] = smtp_email
    message['To'] = recipient
    try:
        with smtplib.SMTP(smtp_server, 587) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, recipient, message.as_string().encode('utf-8'))
        return {"status": "success", "message": f'Email sent to {recipient}'}
    except Exception as e:
        return {"status": "error", "message": f'Failed to send due to {str(e)}'}

def replace_random(match):
    options = match.group(1).split('|')
    selected_option = random.choice(options)
    return selected_option

@app.route('/home/mailblaster/send_campaign',  methods=['POST'])
def send_campaign():
    if request.method == 'POST':
        try:
            campaign_name = request.form["campaign_name"]
            username = session["username"]
            user = ClientsInfo.query.filter_by(username=username).first()
            campaign = Campaign.query.filter_by(campaign_name=campaign_name).first()
            subject = campaign.subject.replace("{{name}}", campaign.current_recipient)
            pattern = r'\{([^|]+(?:\|[^|]+)*)\}'
            subject = re.sub(pattern, replace_random, subject)
            response = send_email(
                campaign_name,
                subject,
                campaign.body,
                user.smtp_server,
                user.smtp_email,
                user.smtp_password,
                campaign.current_recipient
            )
            if response["status"] == "success":
                random_minutes = randint(2, 5)
                new_time = datetime.now() + timedelta(minutes=random_minutes)
                campaign.next_send = new_time.strftime('%Y-%m-%d %H:%M:%S')
                recipients=json.loads(campaign.recipients)
                recipients_emails = [json.loads(recipient)["email"] for recipient in recipients]
                index = recipients_emails.index(campaign.current_recipient)
                current_recipient_data = json.loads(recipients[index])
                current_recipient_data["status"] = "sent"
                recipients[index] = json.dumps(current_recipient_data)
                campaign.recipients = json.dumps(recipients)
                if index+1 <= len(recipients)-1:
                    index += 1
                    campaign.current_recipient = json.loads(recipients[index])["email"]
                else:
                    campaign.current_recipient = None
                    campaign.campaign_status = "completed"
                    campaign.next_send = None
                db.session.commit()
                return jsonify({'result': 'success', 'message': response["message"]})
            else:
                return jsonify({'result': 'error', 'message': response["message"]})
        except Exception as e:
            return jsonify({'result': 'error', 'message': f'Error due {e}'})
    return render_template('mailblaster.html')

@app.route('/home/mailblaster/settings',  methods=['POST'])
def settings():
    if request.method == 'POST':
        smtp = request.form['smtp-server']
        email = request.form['sender-email']
        password = request.form['sender-password']
        try:
            server = smtplib.SMTP(smtp)
            server.starttls()
            server.login(email, password)
            server.quit()
            username = session["username"]
            user = ClientsInfo.query.filter_by(username=username).first()
            user.smtp_server = smtp
            user.smtp_email = email
            user.smtp_password = password
            db.session.commit()
            return jsonify({'result': 'success', 'message': 'Credentials verified and stored in session'})
        except smtplib.SMTPAuthenticationError:
            return jsonify({'result': 'error', 'message': 'Invalid credentials'})
        except smtplib.SMTPConnectError:
            return jsonify({'result': 'error', 'message': 'Failed to connect to the SMTP server'})
    return render_template('mailblaster.html')

@app.route('/home/mailblaster/add_campaign', methods=['POST'])
def add_campaign():
    if request.method == 'POST':
        username = session.get("username")
        campaign_name = request.form.get('campaign_name')
        campaign = Campaign.query.filter_by(campaign_name=username+"$"+campaign_name,).first()
        if campaign:
            return jsonify({'result': 'error', 'message': 'Campaign already exists'})
        subject = request.form.get('subject')
        body = request.form.get('htmlContent')
        recipients = request.form.get('recipients')
        recipients = [recipient.strip().split(",") for recipient in recipients.split('\n') if recipient.strip()]
        recipients_list = [json.dumps({"name": recipient[0].strip(), "email": recipient[1].strip(), "status": "unsent"}) for recipient in recipients]
        current_recipient = json.loads(recipients_list[0])["email"]
        credits = len(recipients_list)
        user = ClientsInfo.query.filter_by(username=username).first()
        if user.credits >= credits:
            new_campaign = Campaign(
                username=username,
                campaign_name=username+"$"+campaign_name,
                subject=subject,
                body=body,
                current_recipient=current_recipient,
                recipients=json.dumps(recipients_list)
            )
            try:
                user.credits -= credits
                db.session.add(new_campaign)
                db.session.commit()
                return jsonify({'result': 'success', 'message': 'Campaign created'})
            except Exception as e:
                db.session.rollback()
                logging.info(str(e))
                return jsonify({'result': 'error', 'message': f'Failed to create campaign {str(e)}'})
        return jsonify({'result': 'error', 'message': 'Not enough credits'})
    return render_template('mailblaster.html')

@app.route('/home/mailblaster/toggle_campaign', methods=['POST'])
def toggle_campaign():
    if request.method == 'POST':
        try:
            user = ClientsInfo.query.filter_by(username=session["username"]).first()
            smtp_server = user.smtp_server
            smtp_email  = user.smtp_email
            smtp_password = user.smtp_password
            if smtp_server and smtp_email and smtp_password:
                campaign_name = request.form.get('campaign_name')
                campaign = Campaign.query.filter_by(campaign_name=campaign_name).first()
                if campaign.campaign_status == "running":
                    campaign.campaign_status = "stopped"
                    campaign.next_send = None
                else:
                    campaign.campaign_status = "running"
                    now = datetime.now()
                    delta = timedelta(seconds=30)
                    new_time = now + delta
                    campaign.next_send = new_time.strftime('%Y-%m-%d %H:%M:%S')
                db.session.commit()
                return jsonify({'result': 'success'})
            return jsonify({'result': 'server', 'message': 'Email sender is not set'})
        except Exception as e:
            return jsonify({'result': 'error', 'message': str(e)})
    return render_template('mailblaster.html')

@app.route('/home/mailblaster/delete_campaign', methods=['POST'])
def delete_campaign():
    if request.method == 'POST':
        try:
            campaign_name = request.form.get('campaign_name')
            campaign = Campaign.query.filter_by(campaign_name=campaign_name).first()
            if campaign:
                db.session.delete(campaign)
                db.session.commit()
                return jsonify({'result': 'success', 'message': 'Campaign deleted successfully'})
            return jsonify({'result': 'error', 'message': 'Campaign not exists'})
        except Exception as e:
            return jsonify({'result': 'error', 'message': str(e)})
    return render_template('mailblaster.html')

@app.route('/logout', methods=['POST'])
def logout():
    session.clear()
    return redirect(url_for('login'))

@app.route('/admin')
def admin():
    if session.get('is_admin', False) or session.get('is_super', False):
        users = ClientsInfo.query.all()
        return render_template('admin.html', users=users)
    else:
        return redirect(url_for('login'))

@app.route('/admin/buy_credits', methods=['POST'])
def buy_credits():
    username = request.form.get('username')
    credits = request.form.get('credits')
    user = ClientsInfo.query.get(username)
    user.credits += int(credits)
    db.session.commit()
    return redirect('/admin')

@app.route('/admin/clear_credits', methods=['POST'])
def clear_credits():
    username = request.form.get('username')
    user = ClientsInfo.query.get(username)
    user.credits = 0
    db.session.commit()
    return redirect('/admin')

@app.route('/admin/delete_account', methods=['POST'])
def delete_account():
    username = request.form.get('username')
    user = ClientsInfo.query.get(username)
    if user:
        db.session.delete(user)
        db.session.commit()
    return redirect('/admin')

@app.route('/admin/update_status', methods=['POST'])
def update_status():
    username = request.form.get('username')
    new_status = request.form.get('status')
    user = ClientsInfo.query.get(username)
    if user:
        user.status = new_status
        db.session.commit()
    return redirect('/admin')

@app.route('/admin/tasks_manual', methods=['POST'])
def tasks_manual():
    username = request.form.get('username')
    tasks = ClientsTable.query.filter_by(username=username).all()
    user = ClientsInfo.query.filter_by(username=username).first()
    return render_template('tasks_manual.html', tasks=tasks, username=username, email=user.email)

@app.route('/admin/change_task', methods=['POST'])
def change_task():
    if request.method == 'POST':
        try:
            taskname = request.form["taskname"]
            scraped_emails = request.form['scraped_emails']
            download = request.form['download']
            task = ClientsTable.query.filter_by(taskname=taskname).first()
            if task:
                task.scraped_emails = int(scraped_emails)
                task.download = download
                db.session.commit()
                return jsonify({'result': 'success'})
        except Exception as e:
            return jsonify({'result': 'error', 'message': f"Error {e}"})
    return render_template('tasks_manual.html')

@app.errorhandler(500)
def internal_server_error(error):
    response = jsonify({'error': str(error)})
    response.status_code = 500
    return response

@app.errorhandler(405)
def page_not_allowed(e):
    return render_template('error405.html'), 405

@app.errorhandler(404)
def page_not_found(e):
    return render_template('error404.html'), 404

"""
@app.errorhandler(500)
def under_maintenance(e):
    return render_template('error500.html'), 500
"""

def generate_token(email):
    token = secrets.token_hex(nbytes=16)
    return token

def refund_email(receiver_email, supply, used, refund):
    msg = Message('Refund credits', sender=app.config['MAIL_USERNAME'], recipients=[receiver_email])
    msg.html = render_template('credits.html', supply=supply, used=used, refund=refund)
    mail.send(msg)

def send_email_recover(receiver_email, reset_link):
    msg = Message('Reset password', sender=app.config['MAIL_USERNAME'], recipients=[receiver_email])
    msg.body = f'Click this link to reset your password: {reset_link}'
    mail.send(msg)
    f'Click this link to reset your password: {reset_link}'

@app.route('/validate', methods=['GET', 'POST'])
def validate():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        if username == "username" and password == "password":
            session['logged_in'] = True
            return redirect(url_for('filtering'))
    return render_template('validate.html')

@app.route('/instagram')
def instagram():
    return render_template('instagram.html')

@app.route('/checker')
def checker():
    return render_template('checker.html')

@app.route('/task-name')
def task_name():
    return render_template('task-name.html')

@app.route('/filter')
def filtering():
    if not session.get('logged_in'):
        return redirect(url_for('validate'))
    nr = max([len(string) for string in numbers_list])+5
    return render_template('filter.html',
                            country_data = [d[0]+(nr-len(d[0]))*' '+d[1] for d in zip(numbers_list, country_list)]
                            , category_list=category_list)

@app.route('/transform', methods=['POST'])
def transform():
    google_sheets_url = request.form["google_sheets_url"]
    response = requests.get(google_sheets_url)
    content = response.content
    soup = BeautifulSoup(content, 'html.parser')
    filename = "leads"
    try:
        filename = soup.find('title').text
        filename = ''.join(filename.split('-')[:-1])
    except:
        pass
    google_sheets_url = f'https://docs.google.com/spreadsheets/d/{get_spreadsheet_id(google_sheets_url)}/gviz/tq?tqx=out:csv'
    response = requests.get(google_sheets_url)
    df = pd.read_csv(io.StringIO(response.text))
    expected_headers = ["pk", "username", "full_name", "follower_count", "following_count", "account_type", "is_private",
                        "biography", "is_business", "category", "contact_phone_number", "address_street",
                        "public_email", "zip", "city_name", "usertags_count", "media_count", "is_verified",
                        "external_url", "latitude", "longitude", "is_potential_business", "public_phone_country_code",
                        "whatsapp_number"]

    if not all(header in df.columns for header in expected_headers):
        df.columns = expected_headers
    logging.info(df.columns)
    df = removing(df)
    csv_data = df.to_csv(index=False)
    response = Response(
        csv_data,
        content_type='text/csv',
        headers={
            "Content-Disposition": f"attachment; filename={filename}.csv"
        }
    )
    return response

"""
@app.route('/transform-user', methods=['POST'])
def transform_user():
    google_sheets_url = request.form["google_sheets_url"]
    category = [category.strip() for category in request.form["categories_textarea"].split("\n")]
    numbers = [number.strip() for number in request.form["numbers_textarea"].split("\n")]
    logging.info(category)
    logging.info(numbers)
    response = requests.get(google_sheets_url)
    content = response.content
    soup = BeautifulSoup(content, 'html.parser')
    filename = soup.find('title').text
    filename = ''.join(filename.split('-')[:-1])
    google_sheets_url = f'https://docs.google.com/spreadsheets/d/{get_spreadsheet_id(google_sheets_url)}/gviz/tq?tqx=out:csv'
    response = requests.get(google_sheets_url)
    df = pd.read_csv(io.StringIO(response.text))
    df = removing_user(df, numbers, category)
    csv_data = df.to_csv(index=False)
    response = Response(
        csv_data,
        content_type='text/csv',
        headers={
            "Content-Disposition": f"attachment; filename={filename}.csv"
        }
    )
    return response
"""

def get_spreadsheet_id(google_sheets_url):
    pattern = r'/spreadsheets/d/([a-zA-Z0-9-_]+)'
    match = re.search(pattern, google_sheets_url)
    return match.group(1)

def removing(df):
    phone_column, category_column = "contact_phone_number", "category"
    df = df[pd.notna(df[phone_column])]
    df[phone_column] = df[phone_column].astype(str)
    df[phone_column] = df[phone_column].str.replace("+", "")
    df[phone_column] = df[phone_column].apply(lambda x: x[:-2] if x.endswith(".0") else x)
    df = df[~df[phone_column].str.startswith(tuple(code for code in numbers_list))]
    df[category_column] = df[category_column].str.lower()
    df = df[~df[category_column].isin(category_list)]
    return df

def removing_user(df, numbers, category):
    logging.info(numbers)
    logging.info(category)
    phone_column, category_column = "contact_phone_number", "category"
    initial_count = len(df)
    df = df[pd.notna(df[phone_column])]
    df[phone_column] = df[phone_column].astype(str)
    df[phone_column] = df[phone_column].str.replace("+", "")
    df[phone_column] = df[phone_column].apply(lambda x: x[:-2] if x.endswith(".0") else x)
    df = df[~df[phone_column].str.startswith(tuple(code for code in numbers))]
    df[category_column] = df[category_column].str.lower()
    df = df[~df[category_column].isin(category)]
    total_removed_count = initial_count - len(df)
    logging.info(total_removed_count)
    return df

@app.route('/recover', methods=['GET', 'POST'])
def recover():
    if request.method == 'POST':
        email = request.form['email']
        user = ClientsInfo.query.filter_by(email=email).first()
        if user:
            # Generate a random token and store it in the user's account
            token = secrets.token_hex(16)
            user.token = token
            db.session.commit()
            session['token'] = token
            send_email_recover(email, f"https://leads.pythonanywhere.com/reset/{token}")
            return jsonify({"result": "successful"})
        return jsonify({"result": "failed"})
    return render_template("recover.html")

@app.route('/reset/<string:token>', methods=['GET', 'POST'])
def reset(token):
    if request.method == 'POST':
        user = ClientsInfo.query.filter_by(token=token).first()
        if user:
            new_password = request.form['password']
            user.set_password(new_password)
            user.token = None
            db.session.commit()
            return jsonify({"result": "successful"})
        else:
            return jsonify({"result": "wrong-token"})
    return render_template("reset.html", token=token)

@app.route('/retract', methods=['GET', 'POST'])
def retract():
    if request.method == 'POST':
        if 'username' in session:
            username=session['username']
            user = ClientsInfo.query.filter_by(username=username).first()
            platform_select = request.form['platform-select']
            task_name = request.form["task-name"]
            url = request.form["scrape-info"]
            maximum_emails = request.form["max-emails"]
            if user.status != "special":
                user.credits -= int(maximum_emails)
            task = ClientsTable.query.filter_by(taskname=task_name).first()
            if task:
                return jsonify({"result": "duplicated"})
            new_task = ClientsTable(
                username,
                platform_select,
                task_name,
                url,0,maximum_emails, "")
            db.session.add(new_task)
            db.session.commit()
            return jsonify({"result": "created", "credits": user.credits})
        else:
            return jsonify({"result": "not-created", "credits": user.credits})
    return redirect(url_for('home'))

@app.route('/tasks_list', methods=['POST'])
def tasks_list():
    username = request.form.get('username')
    tasks_all = ClientsTable.query.filter_by(username=username).all()
    for task in tasks_all:
        task_dict = task.__dict__
        task_dict.pop('_sa_instance_state', None)
    return render_template('tasks.html', tasks_all=tasks_all, username=username)

@app.route('/task_table', methods=['POST'])
def task_table():
    username = request.form.get('task_name')
    task = {
        "scrape_info": request.form.get('task_url'),
        "scraped_emails": request.form.get('task_scraped'),
        "maximum_emails": request.form.get('task_maximum'),
        "scrape_type": "-",
        "status": "Pending",
        "download_sheet": request.form.get('task_download'),
    }
    if int(task["scraped_emails"]) > 0:
        task["status"] = "Complete"
    return render_template('task.html', task=task, username=username, check=False)
