// Backend/services/emailService.js

const nodemailer = require('nodemailer');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const { query } = require('../database.js');

class EmailService {
    constructor() {
        this.transporter = nodemailer.createTransport({
            host: process.env.EMAIL_HOST || 'smtp.gmail.com',
            port: parseInt(process.env.EMAIL_PORT || '587'),
            secure: false,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            },
        });
        this.templateDir = path.join(__dirname, '..', 'templates');
        this.baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    }

    async loadTemplate(templateName) {
        const templatePath = path.join(this.templateDir, templateName);
        return await fs.readFile(templatePath, 'utf8');
    }

    async generateActivationToken(email) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
        
        await query(
            `UPDATE users SET activationtoken = $1, activationexpires = $2 WHERE email = $3`,
            [token, expires, email]
        );
        
        return token;
    }

    async sendWelcomeEmail(userEmail, userName) {
        try {
            let template = await this.loadTemplate('welcome-teacher.html');
            
            const token = await this.generateActivationToken(userEmail);
            const activationLink = `${this.baseUrl}/HTML/activate-account.html?token=${token}`;
            
            template = template.replace(/\{\{teacher_name\}\}/g, userName);
            template = template.replace(/\{\{activation_link\}\}/g, activationLink);
            
            const mailOptions = {
                from: `"Baidoa Bedrock ICT Campus" <${process.env.EMAIL_USER}>`,
                to: userEmail,
                subject: 'Welcome to Baidoa Bedrock ICT Campus - Account Activation',
                html: template,
            };

            const info = await this.transporter.sendMail(mailOptions);
            console.log('Welcome email sent:', info.messageId);
            return { success: true, messageId: info.messageId };
        } catch (error) {
            console.error('Email send error:', error);
            return { success: false, error: error.message };
        }
    }

    async verifyActivation(token) {
        const { rows } = await query(
            `SELECT * FROM users WHERE activationtoken = $1 AND activationexpires > $2`,
            [token, Date.now()]
        );
        return rows[0] || null;
    }

    async activateAccount(token) {
        const user = await this.verifyActivation(token);
        if (!user) {
            return { success: false, error: 'Invalid or expired activation token.' };
        }
        
        await query(
            `UPDATE users SET isactive = true, activationtoken = NULL, activationexpires = NULL WHERE id = $1`,
            [user.id]
        );
        
        return { success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } };
    }
}

module.exports = new EmailService();
