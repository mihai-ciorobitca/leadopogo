import smtplib
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash
import json
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv
from email.mime.text import MIMEText
from random import randint
from time import sleep

project_folder = os.path.expanduser('~/website')
load_dotenv(os.path.join(project_folder, '.env'))

app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv("SQLALCHEMY_DATABASE_URI")
app.config['MAIL_USERNAME'] = os.getenv("MAIL_USERNAME")
app.config['MAIL_PASSWORD'] = os.getenv("MAIL_PASSWORD")
app.config['MAIL_SERVER']   = 'smtp.gmail.com'
app.config['MAIL_PORT']     = 587
app.config['MAIL_USE_TLS']  = True
app.secret_key = os.getenv("SECRET_KEY")
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {'pool_recycle' : 280}
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

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
    status = db.Column(db.String(255), default='start')
    next_send = db.Column(db.String(255))
    user = db.relationship('ClientsInfo', backref=db.backref('campaigns', lazy=True))

def send_email(subject, body, smtp_server, smtp_email, smtp_password, recipient):
    message = MIMEText(body, 'html')
    message['Subject'] = subject
    message['From'] = smtp_email
    message['To'] = recipient
    try:
        with smtplib.SMTP(smtp_server, 587) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, recipient, message.as_string())
        return f'Email sent to {recipient}'
    except Exception as e:
        return f'Failed to send due to {str(e)}'

def check_users():
    while True:
        try:
            campaigns = Campaign.query.filter_by(status="running")
            for campaign in campaigns:
                current_time = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                send_time = campaign.next_send
                if send_time < current_time:
                    user = ClientsInfo.query.filter_by(username=campaign.username).first()
                    response = send_email(
                        campaign.subject,
                        campaign.body,
                        user.smtp_server,
                        user.smtp_email,
                        user.smtp_password,
                        campaign.current_recipient
                    )
                    print(response, flush=True)
                    random_minutes = randint(2, 5)
                    new_time = datetime.now() + timedelta(minutes=random_minutes)
                    campaign.next_send = new_time.strftime('%Y-%m-%d %H:%M:%S')
                    recipients=json.loads(campaign.recipients)
                    index = recipients.index(campaign.current_recipient)
                    if index < len(recipients)-1:
                        index += 1
                        campaign.current_recipient = recipients[index]
                    else:
                        campaign.current_recipient = None
                        campaign.status = "completed"
                        campaign.next_send = None
                    db.session.commit()
            sleep(10)
        except Exception as e:
            print(str(e) , flush=True)


if __name__ == "__main__":
    print("Task running")
    check_users()