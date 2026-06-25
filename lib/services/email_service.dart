import 'dart:convert';

import 'package:http/http.dart' as http;
import 'package:intl/intl.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../models/reservation.dart';

class EmailService {
  static const String _apiBaseUrl = String.fromEnvironment(
    'EMAIL_API_BASE_URL',
    defaultValue: 'https://sevenroom-email-api.onrender.com',
  );

  bool get isConfigured => _apiBaseUrl.isNotEmpty;

  Future<void> sendReservationCreatedEmail(Reservation reservation) async {
    if (reservation.status == 'aprovado') {
      await _sendReservationEmail(
        reservation: reservation,
        subject: 'Reserva confirmada - SevenRoom',
        title: 'Sua reserva foi confirmada',
        intro:
            'Sua reserva foi criada e confirmada automaticamente. Confira os detalhes abaixo:',
      );
      return;
    }

    await _sendReservationEmail(
      reservation: reservation,
      subject: 'Solicitação de reserva recebida - SevenRoom',
      title: 'Recebemos sua solicitação de reserva',
      intro:
          'Sua solicitação foi registrada e será analisada por um administrador. Confira os detalhes abaixo:',
    );
  }

  Future<void> sendReservationApprovedEmail(Reservation reservation) async {
    await _sendReservationEmail(
      reservation: reservation,
      subject: 'Reserva autorizada - SevenRoom',
      title: 'Sua reserva foi autorizada',
      intro:
          'Um administrador aprovou sua reserva. Confira os detalhes abaixo:',
    );
  }

  Future<void> _sendReservationEmail({
    required Reservation reservation,
    required String subject,
    required String title,
    required String intro,
  }) async {
    final email = reservation.email;
    if (!isConfigured || email == null || email.trim().isEmpty) {
      return;
    }

    final token = await FirebaseAuth.instance.currentUser?.getIdToken();
    if (token == null) return;

    final response = await http.post(
      Uri.parse('$_apiBaseUrl/api/email/send'),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $token',
      },
      body: jsonEncode({
        'to': email.trim(),
        'subject': subject,
        'html': _buildReservationHtml(
          reservation: reservation,
          title: title,
          intro: intro,
        ),
      }),
    );

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw Exception('Falha ao enviar e-mail (${response.statusCode}).');
    }
  }

  String _buildReservationHtml({
    required Reservation reservation,
    required String title,
    required String intro,
  }) {
    final date = reservation.data != null
        ? DateFormat('dd/MM/yyyy').format(reservation.data!)
        : 'Data não informada';
    final start = reservation.horaInicio != null
        ? DateFormat('HH:mm').format(reservation.horaInicio!)
        : '--:--';
    final end = reservation.horaFim != null
        ? DateFormat('HH:mm').format(reservation.horaFim!)
        : '--:--';

    return '''
<div style="font-family: Arial, sans-serif; color: #1E2838; line-height: 1.5;">
  <h2 style="color: #1D51A1;">${_escape(title)}</h2>
  <p>${_escape(intro)}</p>
  <table style="border-collapse: collapse; margin-top: 16px;">
    ${_detailRow('Sala', reservation.roomId)}
    ${_detailRow('Responsável', reservation.responsavelNome)}
    ${_detailRow('Data', date)}
    ${_detailRow('Horário', '$start - $end')}
    ${_detailRow('Status', _statusLabel(reservation.status))}
  </table>
  <p style="margin-top: 24px; color: #7A7F85; font-size: 13px;">SevenRoom</p>
</div>
''';
  }

  String _detailRow(String label, String value) {
    return '''
<tr>
  <td style="padding: 6px 16px 6px 0; color: #7A7F85;">${_escape(label)}</td>
  <td style="padding: 6px 0; font-weight: 700;">${_escape(value)}</td>
</tr>
''';
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'aprovado':
        return 'Aprovada';
      case 'pendente':
        return 'Pendente';
      case 'recusado':
        return 'Recusada';
      case 'cancelado':
        return 'Cancelada';
      default:
        return status;
    }
  }

  String _escape(String value) {
    return value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
  }
}
